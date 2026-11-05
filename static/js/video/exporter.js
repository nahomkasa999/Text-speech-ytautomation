/**
 * Fast offline MP4 exporter (WebCodecs + mp4-muxer).
 */

import { Muxer, ArrayBufferTarget } from '../../vendor/mp4-muxer.js';
import { SAMPLE_RATE, decodeAudio, processAudio, mixAudioChannels } from './audioProcessing.js';
import { isFastExportSupported, yieldToEventLoop, waitForQueue, pickVideoConfig, pickAudioConfig } from './codecs.js';

export { isFastExportSupported };

export class ExportCancelledError extends Error {
  constructor() { super('Export cancelled'); this.name = 'ExportCancelledError'; }
}

async function encodeAudioChunks(audio, audioEncoder, checkAbort, onProgress) {
  onProgress(0, 'Encoding audio');
  const CHUNK = 4096;
  const numberOfChannels = audio.length;
  const totalSamples = audio[0].length;

  for (let pos = 0; pos < totalSamples; pos += CHUNK) {
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
}

async function renderAndEncodeFrames(opts, videoEncoder, checkAbort) {
  const { width, height, fps, speed, videoDuration, renderFrame, onProgress } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });

  const totalFrames = Math.max(1, Math.ceil(videoDuration * fps));
  const frameDur = 1e6 / fps;
  const keyInterval = fps * 2;

  for (let i = 0; i < totalFrames; i++) {
    checkAbort();
    const audioTime = (i / fps) * speed;
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
}

export async function exportVideoFast(opts) {
  const {
    renderFrame, audioUrl, musicUrl, musicVolume = 0.35,
    speed = 1, volume = 1, preservePitch = true,
    fps = 30, videoBitrate = 6_000_000,
    onProgress = () => {}, signal,
  } = opts;
  const width = Math.round(opts.width / 2) * 2;
  const height = Math.round(opts.height / 2) * 2;
  const checkAbort = () => { if (signal?.aborted) throw new ExportCancelledError(); };

  onProgress(0, 'Preparing audio');
  let audio;
  if (audioUrl) {
    const decoded = await decodeAudio(audioUrl);
    checkAbort();
    audio = processAudio(decoded, { speed, volume, preservePitch });
  } else {
    const dur = opts.duration || 10;
    const samples = Math.round(dur * SAMPLE_RATE);
    audio = [new Float32Array(samples), new Float32Array(samples)];
  }

  if (musicUrl) {
    try {
      const musicDecoded = await decodeAudio(musicUrl);
      checkAbort();
      audio = mixAudioChannels(audio, musicDecoded, { musicVolume });
    } catch (e) {
      console.warn('[Export] Could not mix music audio:', e);
    }
  }

  const videoDuration = audio[0].length / SAMPLE_RATE;
  checkAbort();

  const video = await pickVideoConfig(width, height, fps, videoBitrate);
  const aud = await pickAudioConfig(audio.length);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: video.muxCodec, width, height, frameRate: fps },
    audio: { codec: aud.muxCodec, numberOfChannels: audio.length, sampleRate: SAMPLE_RATE },
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
    await encodeAudioChunks(audio, audioEncoder, checkAbort, onProgress);
    if (encoderError) throw encoderError;

    await renderAndEncodeFrames({ width, height, fps, speed, videoDuration, renderFrame, onProgress }, videoEncoder, checkAbort);
    if (encoderError) throw encoderError;

    muxer.finalize();
  } finally {
    closeEncoders();
  }

  return {
    blob: new Blob([target.buffer], { type: 'video/mp4' }),
    ext: 'mp4',
    codecs: `${video.config.codec} + ${aud.muxCodec}`,
    isMp4Friendly: video.muxCodec === 'avc',
  };
}
