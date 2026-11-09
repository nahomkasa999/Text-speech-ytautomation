/**
 * Audio decoding, pitch-preserving time-stretching (WSOLA), and music mixing.
 *
 * Audio is kept at the narration's own sample rate (24 kHz mono for Kokoro)
 * and only resampled to the encoder's rate chunk by chunk while encoding.
 * Decoding a 2-hour narration as 48 kHz stereo would need ~2.8 GB per copy;
 * at 24 kHz mono it is ~0.7 GB, so long exports fit in memory.
 */

export const ENCODER_SAMPLE_RATE = 48000;

/** Sample rate from a WAV header, or null for other formats. */
function wavSampleRate(bytes) {
  if (bytes.byteLength < 28) return null;
  const v = new DataView(bytes);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ') return null;
  const rate = v.getUint32(24, true);
  return rate >= 8000 && rate <= 192000 ? rate : null;
}

/** Returns { channels: Float32Array[] (max 2), sampleRate }. */
export async function decodeAudio(url, sampleRate = null) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`);
  const bytes = await res.arrayBuffer();
  const rate = sampleRate || wavSampleRate(bytes) || ENCODER_SAMPLE_RATE;
  const ctx = new OfflineAudioContext(1, 1, rate);
  const buf = await ctx.decodeAudioData(bytes);
  const channels = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(buf.getChannelData(c));
  return { channels, sampleRate: rate };
}

/** Speed change without pitch preservation (like a tape speed-up). */
export function resampleChannels(channels, speed) {
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

/**
 * Pitch-preserving time stretch (WSOLA), tuned for speech.
 * Periodic Hann windows at 50% overlap sum to exactly 1, so no
 * normalisation buffer is needed (that saved a full-length Float32Array).
 */
export function timeStretchChannels(channels, speed, sampleRate) {
  const inLen = channels[0].length;
  const N = Math.round(sampleRate * 0.03) & ~7;
  const Hs = N / 2;
  const Ha = Hs * speed;
  const delta = Math.round(sampleRate * 0.01);
  const D = 8;

  const monoLen = Math.floor(inLen / D);
  const mono = new Float32Array(monoLen);
  for (let i = 0; i < monoLen; i++) {
    let s = 0;
    for (const ch of channels) for (let k = 0; k < D; k++) s += ch[i * D + k];
    mono[i] = s;
  }

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const finalLen = Math.floor(inLen / speed);
  const outs = channels.map(() => new Float32Array(finalLen + N));
  const Nd = N / D;
  const deltaD = Math.round(delta / D);
  let prevSrc = 0;

  for (let k = 0; ; k++) {
    const ideal = Math.round(k * Ha);
    if (ideal + N + delta >= inLen) break;
    const outPos = k * Hs;
    if (outPos > finalLen) break;
    let src = ideal;
    if (k > 0) {
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
    prevSrc = src;
  }

  return outs.map((out) => out.subarray(0, finalLen));
}

export function processAudio(channels, { speed, volume, preservePitch, sampleRate }) {
  let out = channels;
  if (Math.abs(speed - 1) > 1e-3) {
    out = preservePitch ? timeStretchChannels(out, speed, sampleRate) : resampleChannels(out, speed);
  }
  if (Math.abs(volume - 1) > 1e-3) {
    for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= volume;
  }
  return out;
}

/** Mixes looping background music into the narration channels, in place. */
export function mixAudioChannels(mainChannels, musicChannels, { musicVolume = 0.35 } = {}) {
  if (!musicChannels || musicChannels.length === 0) return mainChannels;
  const totalSamples = mainChannels[0].length;
  const musicSamples = musicChannels[0].length;
  const downmix = mainChannels.length === 1 && musicChannels.length > 1;

  for (let c = 0; c < mainChannels.length; c++) {
    const srcCh = musicChannels[c % musicChannels.length];
    const outCh = mainChannels[c];
    for (let i = 0; i < totalSamples; i++) {
      const m = i % musicSamples;
      const music = downmix ? (musicChannels[0][m] + musicChannels[1][m]) * 0.5 : srcCh[m];
      const val = outCh[i] + music * musicVolume;
      outCh[i] = val > 1 ? 1 : (val < -1 ? -1 : val);
    }
  }
  return mainChannels;
}
