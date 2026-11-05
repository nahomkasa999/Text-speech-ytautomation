/**
 * Hardware WebCodecs Configuration and Queue Helpers.
 */

import { SAMPLE_RATE } from './audioProcessing.js';

export function isFastExportSupported() {
  return typeof VideoEncoder !== 'undefined'
    && typeof AudioEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof AudioData !== 'undefined';
}

export const yieldToEventLoop = () => new Promise((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => resolve();
  ch.port2.postMessage(null);
});

export async function waitForQueue(encoder, maxQueue) {
  while (encoder.encodeQueueSize > maxQueue) {
    if ('ondequeue' in encoder) {
      await new Promise((r) => encoder.addEventListener('dequeue', r, { once: true }));
    } else {
      await yieldToEventLoop();
    }
  }
}

export async function pickVideoConfig(width, height, fps, bitrate) {
  const candidates = [
    { muxCodec: 'avc', codec: 'avc1.640028', avc: { format: 'avc' } },
    { muxCodec: 'avc', codec: 'avc1.4d0028', avc: { format: 'avc' } },
    { muxCodec: 'avc', codec: 'avc1.42002a', avc: { format: 'avc' } },
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
      } catch { /* try next candidate */ }
    }
  }
  throw new Error('No supported video encoder (H.264/VP9) found');
}

export async function pickAudioConfig(numberOfChannels) {
  const candidates = [
    { muxCodec: 'aac', codec: 'mp4a.40.2' },
    { muxCodec: 'opus', codec: 'opus' },
  ];
  for (const c of candidates) {
    const config = { codec: c.codec, sampleRate: SAMPLE_RATE, numberOfChannels, bitrate: 160000 };
    try {
      const { supported } = await AudioEncoder.isConfigSupported(config);
      if (supported) return { config, muxCodec: c.muxCodec };
    } catch { /* try next candidate */ }
  }
  throw new Error('No supported audio encoder (AAC/Opus) found');
}
