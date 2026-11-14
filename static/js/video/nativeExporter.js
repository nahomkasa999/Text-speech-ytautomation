import { createExportRenderer } from './exportRenderer.js';
import { ExportCancelledError } from './exporter.js';

// Encoded frames are uploaded in ordered batches while the next frames render.
const BATCH_BYTES = 4 * 1024 * 1024;
const BATCH_FRAMES = 120;
// An idle uploader waits for this much before sending, so requests are not one frame each.
const MIN_BATCH_FRAMES = 8;
const MIN_BATCH_BYTES = 1024 * 1024;
// Encoded frames waiting for the server. Rendering pauses above this.
const MAX_QUEUED_BYTES = 32 * 1024 * 1024;
// Frames handed to the encoder but not yet taken by it.
const MAX_ENCODE_QUEUE = 4;
// Frames encoded before the job is committed to the encoder: a failure before
// this point falls back to raw frames without asking for a new destination.
const COMMIT_FRAMES = 30;
// Give the UI a turn this often. setTimeout is throttled in hidden windows; a message is not.
const YIELD_MS = 50;
const REPORT_MS = 200;

export function hasNativeExport() {
  return typeof window.pywebview?.api?.prepare_video_export === 'function';
}

async function requestJob(id, suffix, options = {}) {
  const response = await fetch(`/api/native-export/${id}${suffix}`, options);
  const result = await response.json();
  if (!response.ok || result.ok === false || result.stage === 'failed') throw new Error(result.detail || result.error || 'Export request failed.');
  if (result.stage === 'cancelled') throw new ExportCancelledError();
  return result;
}

function yieldToUi() {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(null);
  });
}

async function uploadMusic(id, url, signal, onProgress) {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error('Background music could not be read.');
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let pos = 0; pos < value.length; pos += 4 * 1024 * 1024) {
        const chunk = value.subarray(pos, pos + 4 * 1024 * 1024);
        await requestJob(id, `/music?offset=${offset}`, { method: 'PUT', body: chunk, signal });
        offset += chunk.length;
        onProgress({ stage: 'Preparing music', uploaded_bytes: offset });
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Mirrors _video_bitrate() on the server; only used to ask whether a config is supported.
function estimatedBitrate(width, height, fps, format) {
  const maxrate = Math.max(500_000, Math.min(8_000_000, Math.ceil(8_000_000 * width * height / (1920 * 1080) * fps / 30)));
  return format === 'mp4' ? maxrate : Math.min(4_000_000, maxrate);
}

// The lowest H.264 level whose frame size and macroblock rate fit the video.
function avcLevel(width, height, fps) {
  const blocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const levels = [[0x1f, 3600, 108000], [0x20, 5120, 216000], [0x28, 8192, 245760], [0x2a, 8704, 522240], [0x32, 22080, 589824]];
  return (levels.find(([, size, rate]) => blocks <= size && blocks * fps <= rate) || [0x33])[0];
}

/**
 * WebCodecs configs the browser says it can encode, best first: the browser's
 * own choice (which may be a hardware encoder), then a software encoder.
 * MP4 gets H.264 in Annex B form (SPS/PPS in the stream); WebM gets VP9.
 */
export async function webCodecsConfigs({ format, width, height, fps, bitrate }) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || !VideoEncoder.isConfigSupported) return [];
  const level = avcLevel(width, height, fps).toString(16).padStart(2, '0');
  const codecs = format === 'mp4'
    ? ['6400', '4d00', '42e0'].map(profile => `avc1.${profile}${level}`)
    : ['vp09.00.41.08', 'vp09.00.40.08', 'vp09.00.31.08'];
  const configs = [];
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference', 'prefer-software']) {
    for (const codec of codecs) {
      const config = {
        codec, width, height, bitrate, framerate: fps, bitrateMode: 'variable',
        // 'realtime' may drop frames. Frame order is checked on output either way.
        latencyMode: 'quality', hardwareAcceleration,
        ...(format === 'mp4' ? { avc: { format: 'annexb' } } : {}),
      };
      try {
        const { supported } = await VideoEncoder.isConfigSupported(config);
        if (supported) { configs.push(config); break; }
      } catch { /* try the next codec string */ }
    }
  }
  return configs;
}

// An encoder failure before any encoded data reached the server: retry another way.
class EncoderFallback extends Error {
  constructor(cause) { super(cause?.message || String(cause)); this.name = 'EncoderFallback'; this.cause = cause; }
}

function isAbort(error, signal) {
  return signal.aborted || error?.name === 'AbortError' || error instanceof ExportCancelledError;
}

/**
 * Render every output frame, encode it with WebCodecs and stream the chunks to
 * the server, which muxes them without re-encoding. Throws EncoderFallback if
 * the encoder fails before the job was committed to encoded video.
 */
async function encodeFrames({ job, renderer, speed, config, signal, frameDone, stats }) {
  const fps = job.fps;
  const total = job.total_frames;
  const timestamp = index => Math.round(index * 1e6 / fps);
  const batchBytes = Math.min(BATCH_BYTES, job.max_batch_bytes);
  const batchFrames = Math.min(BATCH_FRAMES, job.max_batch_frames);
  const queue = [];
  let queuedBytes = 0;
  let encoded = 0;
  let sent = 0;
  let uploading = null;
  let committed = false;
  let started = false;
  let flushing = false;
  let failure = null;
  let wakeStop;
  const stopped = new Promise(resolve => { wakeStop = resolve; });
  const fail = error => { failure ??= error; wakeStop(); };
  const onAbort = () => wakeStop();
  signal.addEventListener('abort', onAbort);

  const send = () => {
    if (!started || uploading || failure || !queue.length) return;
    if (!flushing && queue.length < MIN_BATCH_FRAMES && queuedBytes < MIN_BATCH_BYTES) return;
    let count = 0;
    let bytes = 0;
    while (count < queue.length && count < batchFrames &&
      (count === 0 || bytes + 5 + queue[count].data.byteLength <= batchBytes)) {
      bytes += 5 + queue[count].data.byteLength;
      count++;
    }
    const frames = queue.splice(0, count);
    queuedBytes -= bytes - 5 * count;
    const body = new Uint8Array(bytes);
    const view = new DataView(body.buffer);
    let pos = 0;
    for (const frame of frames) {
      view.setUint32(pos, frame.data.byteLength, true);
      body[pos + 4] = frame.key ? 1 : 0;
      body.set(frame.data, pos + 5);
      pos += 5 + frame.data.byteLength;
    }
    uploading = requestJob(job.id, `/chunks?index=${sent}&count=${count}`, {
      method: 'PUT', body, signal, headers: { 'Content-Type': 'application/octet-stream' },
    }).then(status => { sent += count; frameDone(sent, status); }, fail)
      .finally(() => { uploading = null; send(); });
  };

  const encoder = new VideoEncoder({
    output(chunk) {
      if (failure) return;
      // The server stamps frame n at n / fps, so chunks must come out in input order.
      if (chunk.timestamp !== timestamp(encoded)) {
        fail(new Error(`The video encoder returned frames out of order (${chunk.timestamp} µs, expected ${timestamp(encoded)} µs).`));
        return;
      }
      if (encoded === 0 && chunk.type !== 'key') { fail(new Error('The video encoder did not start with a keyframe.')); return; }
      if (chunk.byteLength + 5 > job.max_batch_bytes) { fail(new Error('An encoded video frame is too large to upload.')); return; }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      queue.push({ key: chunk.type === 'key', data });
      queuedBytes += data.byteLength;
      encoded++;
      send();
    },
    error(error) { fail(new Error(`The video encoder failed: ${error.message || error}`)); },
  });
  const check = () => {
    if (signal.aborted) throw new ExportCancelledError();
    if (failure) throw failure;
  };
  const commit = async () => {
    // From here on a failure ends the export instead of falling back.
    committed = true;
    await requestJob(job.id, '/start?video=webcodecs', { method: 'POST', signal });
    started = true;
    send();
  };
  const waitFor = promise => Promise.race([promise, stopped]);

  try {
    try {
      encoder.configure(config);
    } catch (error) {
      fail(new Error(`The video encoder rejected its settings: ${error.message}`));
    }
    let lastYield = performance.now();
    for (let index = 0; index < total;) {
      check();
      await renderer.renderFrame(index / fps * speed);
      stats.renderedFrames++;
      check();
      const repeat = renderer.repeatFrames(index, total, fps, speed);
      // Identical frames are not drawn again, but the stream has one frame per 1/fps.
      const picture = new VideoFrame(renderer.canvas, { timestamp: timestamp(index), duration: timestamp(index + 1) - timestamp(index) });
      try {
        for (let offset = 0; offset < repeat; offset++) {
          const frameIndex = index + offset;
          while (encoder.encodeQueueSize >= MAX_ENCODE_QUEUE && !failure && !signal.aborted) {
            await waitFor('ondequeue' in encoder
              ? new Promise(resolve => encoder.addEventListener('dequeue', resolve, { once: true }))
              : yieldToUi());
          }
          while (queuedBytes > MAX_QUEUED_BYTES && uploading && !failure && !signal.aborted) await waitFor(uploading);
          check();
          const frame = offset === 0 ? picture : new VideoFrame(picture, {
            timestamp: timestamp(frameIndex), duration: timestamp(frameIndex + 1) - timestamp(frameIndex),
          });
          try {
            encoder.encode(frame, { keyFrame: frameIndex % job.keyframe_interval === 0 });
          } finally {
            if (frame !== picture) frame.close();
          }
        }
      } finally {
        picture.close();
      }
      index += repeat;
      if (!committed && encoded >= COMMIT_FRAMES) await commit();
      frameDone(null, null, index);
      if (performance.now() - lastYield > YIELD_MS) {
        await yieldToUi();
        lastYield = performance.now();
      }
    }
    check();
    await waitFor(encoder.flush().catch(error => fail(new Error(`The video encoder failed: ${error.message || error}`))));
    check();
    if (encoded !== total) throw new Error(`The video encoder returned ${encoded} of ${total} frames.`);
    if (!committed) await commit();
    flushing = true;
    send();
    while (queue.length || uploading) {
      check();
      if (uploading) await uploading;
      else send();
    }
    check();
  } catch (error) {
    if (!committed && !isAbort(error, signal)) throw new EncoderFallback(error);
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (encoder.state !== 'closed') encoder.close();
    queue.length = 0;
  }
}

// Read back the changed part of each frame and send its pixels for FFmpeg to encode.
async function uploadRawFrames({ job, renderer, speed, signal, frameDone, stats }) {
  if (job.max_patch_batch_bytes && job.max_patch_batch_frames && job.max_patch_batch_records) {
    return uploadRawBatches({ job, renderer, speed, signal, frameDone, stats });
  }
  const ctx = renderer.canvas.getContext('2d');
  let lastYield = performance.now();
  for (let index = 0; index < job.total_frames;) {
    if (signal.aborted) throw new ExportCancelledError();
    const dirty = await renderer.renderFrame(index / job.fps * speed);
    if (signal.aborted) throw new ExportCancelledError();
    const repeat = renderer.repeatFrames(index, job.total_frames, job.fps, speed);
    const pixels = ctx.getImageData(dirty.x, dirty.y, dirty.width, dirty.height).data;
    const box = `x=${dirty.x}&y=${dirty.y}&width=${dirty.width}&height=${dirty.height}`;
    const status = await requestJob(job.id, `/frame?index=${index}&repeat=${repeat}&${box}`, {
      method: 'PUT', body: pixels, signal,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    stats.renderedFrames++;
    index += repeat;
    frameDone(index, status, index);
    if (performance.now() - lastYield > YIELD_MS) {
      await yieldToUi();
      lastYield = performance.now();
    }
  }
}

async function uploadRawBatches({ job, renderer, speed, signal, frameDone, stats }) {
  const ctx = renderer.canvas.getContext('2d');
  const byteLimit = Math.min(16 * 1024 * 1024, job.max_patch_batch_bytes);
  const frameLimit = Math.min(300, job.max_patch_batch_frames);
  const recordLimit = Math.min(120, job.max_patch_batch_records);
  let records = [];
  let bytes = 0;
  let frames = 0;
  let firstIndex = 0;
  let uploading = null;
  let failure = null;
  let lastYield = performance.now();
  const check = () => {
    if (signal.aborted) throw new ExportCancelledError();
    if (failure) throw failure;
  };
  const send = async () => {
    if (!records.length) return;
    if (uploading) await uploading;
    check();
    const body = new Uint8Array(bytes);
    const view = new DataView(body.buffer);
    let offset = 0;
    for (const { dirty, repeat, pixels } of records) {
      const fields = [dirty.x, dirty.y, dirty.width, dirty.height, repeat, pixels.byteLength];
      for (let field = 0; field < fields.length; field++) view.setUint32(offset + field * 4, fields[field], true);
      body.set(pixels, offset + 24);
      offset += 24 + pixels.byteLength;
    }
    const endIndex = firstIndex + frames;
    const suffix = `/frames?index=${firstIndex}&count=${records.length}`;
    uploading = requestJob(job.id, suffix, {
      method: 'PUT', body, signal, headers: { 'Content-Type': 'application/octet-stream' },
    }).then(status => frameDone(endIndex, status), error => { failure = error; });
    firstIndex = endIndex;
    records = [];
    bytes = 0;
    frames = 0;
  };
  try {
    for (let index = 0; index < job.total_frames;) {
      check();
      const dirty = await renderer.renderFrame(index / job.fps * speed);
      check();
      const repeat = Math.min(frameLimit, renderer.repeatFrames(index, job.total_frames, job.fps, speed));
      const size = 24 + dirty.width * dirty.height * 4;
      if (size > byteLimit) throw new Error('A video frame exceeds the server upload limit.');
      if (records.length && (bytes + size > byteLimit || frames + repeat > frameLimit || records.length >= recordLimit)) await send();
      check();
      const pixels = ctx.getImageData(dirty.x, dirty.y, dirty.width, dirty.height).data;
      records.push({ dirty, repeat, pixels });
      bytes += size;
      frames += repeat;
      stats.renderedFrames++;
      index += repeat;
      frameDone(null, null, index);
      if (records.length >= recordLimit || frames >= frameLimit || bytes >= byteLimit) await send();
      if (performance.now() - lastYield > YIELD_MS) {
        await yieldToUi();
        lastYield = performance.now();
      }
    }
    await send();
    if (uploading) await uploading;
    check();
  } finally {
    records = [];
    if (uploading) await uploading;
  }
}

/**
 * `videoEncoding`: 'auto' encodes with WebCodecs when the browser supports it and
 * falls back to raw frames otherwise; 'raw' always sends raw frames.
 */
export async function exportVideoNative({ scene, bgImage, settings, musicUrl, signal, onProgress = () => {}, onFrame = () => {}, videoEncoding = 'auto' }) {
  let job;
  let renderer;
  let poll;
  let polling = false;
  let complete = false;
  const stats = { renderedFrames: 0 };
  const video = { path: 'raw', codec: null, hardwareAcceleration: null, fallback: null };
  const started = performance.now();
  const checkAbort = () => { if (signal.aborted) throw new ExportCancelledError(); };
  const report = (status) => onProgress({ ...status, elapsed_seconds: (performance.now() - started) / 1000 });
  const cancel = () => { if (job?.id) requestJob(job.id, '', { method: 'DELETE' }).catch(() => {}); };
  const summary = result => ({
    ...result, rendered_frames: stats.renderedFrames, renderer_stats: renderer?.stats,
    video_path: video.path, video_codec: video.codec, video_hardware_acceleration: video.hardwareAcceleration,
    video_fallback_reason: video.fallback,
  });
  let lastStatus = -Infinity;
  let lastFrame = -Infinity;
  // Status comes from the server (frames it has muxed); the playhead follows rendering.
  const frameDone = (_sent, status, rendered) => {
    const now = performance.now();
    if (status && now - lastStatus >= REPORT_MS) {
      lastStatus = now;
      report(status);
    }
    if (rendered != null && (now - lastFrame >= REPORT_MS || rendered >= job.total_frames)) {
      lastFrame = now;
      onFrame(Math.min(rendered / job.fps * settings.speed, job.duration * settings.speed));
    }
  };
  signal.addEventListener('abort', cancel);
  try {
    let configs = [];
    if (videoEncoding !== 'raw') {
      configs = await webCodecsConfigs({
        format: settings.format, width: settings.width, height: settings.height, fps: settings.fps,
        bitrate: estimatedBitrate(settings.width, settings.height, settings.fps, settings.format),
      }).catch(() => []);
    }
    report({ stage: 'Choose output location' });
    job = await window.pywebview.api.prepare_video_export({ ...settings, video_encoding: configs.length ? 'webcodecs' : 'raw' });
    if (job.cancelled) throw new ExportCancelledError();
    if (!job.ok) throw new Error(job.error || 'Could not prepare export.');
    checkAbort();
    poll = setInterval(async () => {
      if (polling) return;
      polling = true;
      try { report(await requestJob(job.id, '/status')); } catch { /* The active request reports failures. */ }
      finally { polling = false; }
    }, 1000);
    report({ stage: 'Preparing scene', progress: 0 });
    renderer = await createExportRenderer(scene, {
      width: job.width, height: job.height, bgImage, signal,
      willReadFrequently: job.video_encoding !== 'webcodecs',
    });
    checkAbort();
    if (musicUrl) await uploadMusic(job.id, musicUrl, signal, report);
    let encodedDone = false;
    if (job.video_encoding === 'webcodecs') {
      for (const config of configs) {
        const attempt = { ...config, width: job.width, height: job.height, framerate: job.fps, bitrate: job.video_bitrate };
        try {
          report({ stage: 'encoding', frames: 0, progress: 0 });
          await encodeFrames({ job, renderer, speed: settings.speed, config: attempt, signal, frameDone, stats });
          Object.assign(video, { path: 'webcodecs', codec: attempt.codec, hardwareAcceleration: attempt.hardwareAcceleration, fallback: null });
          encodedDone = true;
          break;
        } catch (error) {
          if (!(error instanceof EncoderFallback)) throw error;
          console.warn('[Export] WebCodecs encoder failed before the export started; trying the next option.', error.cause);
          video.fallback = error.message;
          // The next attempt starts again at frame 0 and must repaint everything.
          renderer.reset();
          stats.renderedFrames = 0;
        }
      }
    }
    if (!encodedDone) {
      if (job.video_encoding === 'webcodecs') {
        renderer.dispose();
        renderer = await createExportRenderer(scene, { width: job.width, height: job.height, bgImage, signal });
        stats.renderedFrames = 0;
      }
      if (job.video_encoding === 'webcodecs' && !video.fallback) video.fallback = 'No supported WebCodecs encoder.';
      report(await requestJob(job.id, '/start?video=raw', { method: 'POST', signal }));
      await uploadRawFrames({ job, renderer, speed: settings.speed, signal, frameDone, stats });
    }
    checkAbort();
    report({ stage: 'Finalizing', progress: 1 });
    const result = await requestJob(job.id, '/finish', { method: 'POST', signal });
    complete = true;
    return summary(result);
  } catch (error) {
    if (job?.id) {
      const status = await requestJob(job.id, '/status').catch(() => null);
      if (status?.stage === 'completed') {
        complete = true;
        return summary(status);
      }
    }
    if (signal.aborted || error.name === 'AbortError') throw new ExportCancelledError();
    throw error;
  } finally {
    clearInterval(poll);
    signal.removeEventListener('abort', cancel);
    renderer?.dispose();
    if (job?.id && !complete) await requestJob(job.id, '', { method: 'DELETE' }).catch(() => {});
  }
}
