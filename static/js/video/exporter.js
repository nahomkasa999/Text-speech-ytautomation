/**
 * Fast offline MP4 exporter (WebCodecs + mp4-muxer).
 *
 * Instead of recording the canvas in real time, every frame is rendered
 * as fast as possible at an exact timestamp and fed to the hardware
 * video encoder. Audio is decoded, speed/volume-adjusted offline and
 * encoded separately. Export time is no longer tied to audio duration.
 */
import { Muxer, ArrayBufferTarget } from '../../vendor/mp4-muxer.js';

const SAMPLE_RATE = 48000;

export function isFastExportSupported() {
  return typeof VideoEncoder !== 'undefined'
    && typeof AudioEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof AudioData !== 'undefined';
}

export class ExportCancelledError extends Error {
  constructor() { super('Export cancelled'); this.name = 'ExportCancelledError'; }
}

// Yield to the event loop without timers (timers get throttled in background tabs).
const yieldToEventLoop = () => new Promise((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => resolve();
  ch.port2.postMessage(null);
});

async function waitForQueue(encoder, maxQueue) {
  while (encoder.encodeQueueSize > maxQueue) {
    if ('ondequeue' in encoder) {
      await new Promise((r) => encoder.addEventListener('dequeue', r, { once: true }));
    } else {
      await yieldToEventLoop();
    }
  }
}

// ---------------------------------------------------------------------------
// Audio processing
// ---------------------------------------------------------------------------

async function decodeAudio(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`);
  const bytes = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  const buf = await ctx.decodeAudioData(bytes);
  const channels = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
    channels.push(new Float32Array(buf.getChannelData(c)));
  }
  return channels;
}

/** Speed change without pitch preservation (like a tape speed-up). */
function resampleChannels(channels, speed) {
  const inLen = channels[0].length;
  const outLen = Math.floor(inLen / speed);
  return channels.map((input) => {
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * speed;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, inLen - 1);
      const f = pos - i0;
      out[i] = input[i0] * (1 - f) + input[i1] * f;
    }
    return out;
  });
}

/** Pitch-preserving time stretch (WSOLA), tuned for speech. */
function timeStretchChannels(channels, speed) {
  const inLen = channels[0].length;
  const N = Math.round(SAMPLE_RATE * 0.03) & ~7; // ~30ms window, multiple of 8
  const Hs = N / 2;                               // synthesis hop
  const Ha = Hs * speed;                          // analysis hop
  const delta = Math.round(SAMPLE_RATE * 0.01);   // ±10ms search tolerance
  const D = 8;                                     // decimation for similarity search (6 kHz is plenty for speech)

  // Decimated mono signal for fast cross-correlation
  const monoLen = Math.floor(inLen / D);
  const mono = new Float32Array(monoLen);
  for (let i = 0; i < monoLen; i++) {
    let s = 0;
    for (const ch of channels) {
      for (let k = 0; k < D; k++) s += ch[i * D + k];
    }
    mono[i] = s;
  }

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const outLen = Math.ceil(inLen / speed) + N;
  const outs = channels.map(() => new Float32Array(outLen));
  const wsum = new Float32Array(outLen);

  const Nd = N / D;
  const deltaD = Math.round(delta / D);
  let prevSrc = 0;

  for (let k = 0; ; k++) {
    const ideal = Math.round(k * Ha);
    if (ideal + N + delta >= inLen) break;
    const outPos = k * Hs;

    let src = ideal;
    if (k > 0) {
      // Find the segment near `ideal` most similar to the natural continuation of the last one
      const targetD = Math.floor((prevSrc + Hs) / D);
      const idealD = Math.floor(ideal / D);
      let best = -Infinity;
      let bestOff = 0;
      for (let o = -deltaD; o <= deltaD; o++) {
        const s = idealD + o;
        if (s < 0 || s + Nd >= monoLen || targetD + Nd >= monoLen) continue;
        let corr = 0;
        for (let j = 0; j < Nd; j++) corr += mono[s + j] * mono[targetD + j];
        if (corr > best) { best = corr; bestOff = o; }
      }
      src = Math.max(0, Math.min(inLen - N, ideal + bestOff * D));
    }

    for (let c = 0; c < channels.length; c++) {
      const input = channels[c];
      const out = outs[c];
      for (let j = 0; j < N; j++) out[outPos + j] += input[src + j] * win[j];
    }
    for (let j = 0; j < N; j++) wsum[outPos + j] += win[j];
    prevSrc = src;
  }

  const finalLen = Math.floor(inLen / speed);
  return outs.map((out) => {
    for (let i = 0; i < outLen; i++) if (wsum[i] > 1e-3) out[i] /= wsum[i];
    return out.subarray(0, finalLen);
  });
}

function processAudio(channels, { speed, volume, preservePitch }) {
  let out = channels;
  if (Math.abs(speed - 1) > 1e-3) {
    out = preservePitch ? timeStretchChannels(out, speed) : resampleChannels(out, speed);
  }
  if (Math.abs(volume - 1) > 1e-3) {
    for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= volume;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Codec selection
// ---------------------------------------------------------------------------

async function pickVideoConfig(width, height, fps, bitrate) {
  const candidates = [
    { muxCodec: 'avc', codec: 'avc1.640028', avc: { format: 'avc' } }, // High@4.0
    { muxCodec: 'avc', codec: 'avc1.4d0028', avc: { format: 'avc' } }, // Main@4.0
    { muxCodec: 'avc', codec: 'avc1.42002a', avc: { format: 'avc' } }, // Baseline@4.2
    { muxCodec: 'vp9', codec: 'vp09.00.40.08' },
  ];
  for (const accel of ['prefer-hardware', 'no-preference']) {
    for (const c of candidates) {
      const config = {
        codec: c.codec, width, height, bitrate, framerate: fps,
        hardwareAcceleration: accel, latencyMode: 'quality', bitrateMode: 'variable',
        ...(c.avc ? { avc: c.avc } : {}),
      };
      try {
        const { supported } = await VideoEncoder.isConfigSupported(config);
        if (supported) return { config, muxCodec: c.muxCodec };
      } catch { /* try next */ }
    }
  }
  throw new Error('No supported video encoder (H.264/VP9) found');
}

async function pickAudioConfig(numberOfChannels) {
  const candidates = [
    { muxCodec: 'aac', codec: 'mp4a.40.2' },
    { muxCodec: 'opus', codec: 'opus' },
  ];
  for (const c of candidates) {
    const config = { codec: c.codec, sampleRate: SAMPLE_RATE, numberOfChannels, bitrate: 160000 };
    try {
      const { supported } = await AudioEncoder.isConfigSupported(config);
      if (supported) return { config, muxCodec: c.muxCodec };
    } catch { /* try next */ }
  }
  throw new Error('No supported audio encoder (AAC/Opus) found');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {(ctx: CanvasRenderingContext2D, audioTime: number) => void} opts.renderFrame
 *        Draws the scene at the given time (in source-audio seconds).
 * @param {string} opts.audioUrl
 * @param {number} [opts.speed=1]
 * @param {number} [opts.volume=1]
 * @param {boolean} [opts.preservePitch=true]
 * @param {number} [opts.fps=30]
 * @param {number} [opts.videoBitrate=6000000]
 * @param {(progress: number, stage: string, audioTime?: number) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ blob: Blob, ext: string, codecs: string, isMp4Friendly: boolean }>}
 */
export async function exportVideoFast(opts) {
  const {
    renderFrame, audioUrl,
    speed = 1, volume = 1, preservePitch = true,
    fps = 30, videoBitrate = 6_000_000,
    onProgress = () => {}, signal,
  } = opts;
  const width = Math.round(opts.width / 2) * 2;
  const height = Math.round(opts.height / 2) * 2;
  const checkAbort = () => { if (signal?.aborted) throw new ExportCancelledError(); };

  // 1. Audio: decode + speed/volume
  onProgress(0, 'Preparing audio');
  const decoded = await decodeAudio(audioUrl);
  checkAbort();
  const audio = processAudio(decoded, { speed, volume, preservePitch });
  const numberOfChannels = audio.length;
  const totalSamples = audio[0].length;
  const videoDuration = totalSamples / SAMPLE_RATE;
  checkAbort();

  // 2. Encoders + muxer
  const video = await pickVideoConfig(width, height, fps, videoBitrate);
  const aud = await pickAudioConfig(numberOfChannels);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: video.muxCodec, width, height, frameRate: fps },
    audio: { codec: aud.muxCodec, numberOfChannels, sampleRate: SAMPLE_RATE },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e; },
  });
  videoEncoder.configure(video.config);

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { encoderError = e; },
  });
  audioEncoder.configure(aud.config);

  const closeEncoders = () => {
    try { if (videoEncoder.state !== 'closed') videoEncoder.close(); } catch {}
    try { if (audioEncoder.state !== 'closed') audioEncoder.close(); } catch {}
  };

  try {
    // 3. Encode audio (fast; a few seconds even for long chapters)
    onProgress(0, 'Encoding audio');
    const CHUNK = 4096;
    for (let pos = 0; pos < totalSamples; pos += CHUNK) {
      if (encoderError) throw encoderError;
      const n = Math.min(CHUNK, totalSamples - pos);
      const planar = new Float32Array(n * numberOfChannels);
      for (let c = 0; c < numberOfChannels; c++) planar.set(audio[c].subarray(pos, pos + n), c * n);
      const data = new AudioData({
        format: 'f32-planar', sampleRate: SAMPLE_RATE,
        numberOfFrames: n, numberOfChannels,
        timestamp: Math.round((pos / SAMPLE_RATE) * 1e6),
        data: planar,
      });
      audioEncoder.encode(data);
      data.close();
      if ((pos / CHUNK) % 64 === 0) { await waitForQueue(audioEncoder, 32); checkAbort(); }
    }
    await audioEncoder.flush();

    // 4. Render + encode every video frame as fast as the GPU/encoder allow
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });

    const totalFrames = Math.max(1, Math.ceil(videoDuration * fps));
    const frameDur = 1e6 / fps;
    const keyInterval = fps * 2;

    for (let i = 0; i < totalFrames; i++) {
      if (encoderError) throw encoderError;
      checkAbort();

      const audioTime = (i / fps) * speed; // scene timings are in source-audio seconds
      renderFrame(ctx, audioTime);

      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
      videoEncoder.encode(frame, { keyFrame: i % keyInterval === 0 });
      frame.close();

      await waitForQueue(videoEncoder, 8);
      if (i % 15 === 0) {
        onProgress(i / totalFrames, 'Rendering video', audioTime);
        await yieldToEventLoop();
      }
    }
    onProgress(1, 'Finalizing');
    await videoEncoder.flush();
    if (encoderError) throw encoderError;

    muxer.finalize();
  } finally {
    closeEncoders();
  }

  const isMp4Friendly = video.muxCodec === 'avc';
  return {
    blob: new Blob([target.buffer], { type: 'video/mp4' }),
    ext: 'mp4',
    codecs: `${video.config.codec} + ${aud.muxCodec}`,
    isMp4Friendly,
  };
}
