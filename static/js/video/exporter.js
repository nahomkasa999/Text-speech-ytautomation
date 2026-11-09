/**
 * Fast offline MP4 exporter (WebCodecs + mp4-muxer).
 *
 * The MP4 is written to a file on the local server as it is encoded
 * (ServerFileTarget), and audio is resampled to the encoder rate in small
 * chunks, so memory stays flat no matter how long the video is.
 */

import { Muxer } from '../../vendor/mp4-muxer.js';
import { ENCODER_SAMPLE_RATE, decodeAudio, processAudio, mixAudioChannels } from './audioProcessing.js';
import { isFastExportSupported, yieldToEventLoop, waitForQueue, pickVideoConfig, pickAudioConfig } from './codecs.js';
import { ServerFileTarget } from './serverFileTarget.js';

export { isFastExportSupported };

const AUDIO_BITRATE = 160000;

export class ExportCancelledError extends Error {
  constructor() { super('Export cancelled'); this.name = 'ExportCancelledError'; }
}

function formatGB(bytes) {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** Encodes `audio` (at `srcRate`) as ENCODER_SAMPLE_RATE, resampling one chunk at a time. */
async function encodeAudioChunks({ audio, srcRate, audioEncoder, file, checkAbort, onProgress }) {
  const CHUNK = 4096;
  const numberOfChannels = audio.length;
  const srcLen = audio[0].length;
  const step = srcRate / ENCODER_SAMPLE_RATE;
  const totalOut = Math.floor(srcLen / step);

  for (let pos = 0, n = 0; pos < totalOut; pos += CHUNK, n++) {
    const frames = Math.min(CHUNK, totalOut - pos);
    const planar = new Float32Array(frames * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) {
      const src = audio[c];
      const base = c * frames;
      for (let i = 0; i < frames; i++) {
        const p = (pos + i) * step;
        const i0 = Math.floor(p);
        const i1 = i0 + 1 < srcLen ? i0 + 1 : i0;
        const f = p - i0;
        planar[base + i] = src[i0] * (1 - f) + src[i1] * f;
      }
    }
    const data = new AudioData({
      format: 'f32-planar', sampleRate: ENCODER_SAMPLE_RATE,
      numberOfFrames: frames, numberOfChannels,
      timestamp: Math.round((pos / ENCODER_SAMPLE_RATE) * 1e6),
      data: planar,
    });
    audioEncoder.encode(data);
    data.close();
    if (n % 64 === 0) {
      await waitForQueue(audioEncoder, 32);
      await file.drain();
      checkAbort();
      onProgress(pos / totalOut, 'Encoding audio');
    }
  }
  await audioEncoder.flush();
}

async function renderAndEncodeFrames(opts, videoEncoder, file, checkAbort) {
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
      await file.drain();
      onProgress(i / totalFrames, 'Rendering video', audioTime);
      await yieldToEventLoop();
    }
  }
  onProgress(1, 'Finalizing');
  await videoEncoder.flush();
}

async function prepareAudio({ audioUrl, musicUrl, musicVolume, speed, volume, preservePitch, duration, checkAbort }) {
  let audio;
  let srcRate;
  if (audioUrl) {
    const decoded = await decodeAudio(audioUrl);
    checkAbort();
    srcRate = decoded.sampleRate;
    audio = processAudio(decoded.channels, { speed, volume, preservePitch, sampleRate: srcRate });
  } else {
    srcRate = ENCODER_SAMPLE_RATE;
    const samples = Math.round((duration || 10) * srcRate);
    audio = [new Float32Array(samples), new Float32Array(samples)];
  }

  if (musicUrl) {
    try {
      const music = await decodeAudio(musicUrl, srcRate);
      checkAbort();
      audio = mixAudioChannels(audio, music.channels, { musicVolume });
    } catch (e) {
      console.warn('[Export] Could not mix music audio:', e);
    }
  }
  return { audio, srcRate };
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
  const { audio, srcRate } = await prepareAudio({
    audioUrl, musicUrl, musicVolume, speed, volume, preservePitch, duration: opts.duration, checkAbort,
  });
  const videoDuration = audio[0].length / srcRate;
  checkAbort();

  const file = await ServerFileTarget.create();
  const estimatedBytes = ((videoBitrate + AUDIO_BITRATE) / 8) * videoDuration * 1.1;
  if (file.freeBytes < estimatedBytes) {
    await file.discard();
    throw new Error(`Not enough disk space: this video needs about ${formatGB(estimatedBytes)}, only ${formatGB(file.freeBytes)} is free.`);
  }

  let videoEncoder;
  let audioEncoder;
  const closeEncoders = () => {
    try { if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close(); } catch {}
    try { if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close(); } catch {}
  };

  try {
    const video = await pickVideoConfig(width, height, fps, videoBitrate);
    const aud = await pickAudioConfig(audio.length);
    const muxer = new Muxer({
      target: file.target,
      video: { codec: video.muxCodec, width, height, frameRate: fps },
      audio: { codec: aud.muxCodec, numberOfChannels: audio.length, sampleRate: ENCODER_SAMPLE_RATE },
      fastStart: false,
      firstTimestampBehavior: 'offset',
    });

    let encoderError = null;
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });
    videoEncoder.configure(video.config);
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });
    audioEncoder.configure(aud.config);

    await encodeAudioChunks({ audio, srcRate, audioEncoder, file, checkAbort, onProgress });
    if (encoderError) throw encoderError;
    audio.length = 0;

    await renderAndEncodeFrames({ width, height, fps, speed, videoDuration, renderFrame, onProgress }, videoEncoder, file, checkAbort);
    if (encoderError) throw encoderError;

    muxer.finalize();
    await file.close();
    return {
      url: file.url,
      size: file.size,
      ext: 'mp4',
      codecs: `${video.config.codec} + ${aud.muxCodec}`,
    };
  } catch (err) {
    await file.discard();
    throw err;
  } finally {
    closeEncoders();
  }
}
