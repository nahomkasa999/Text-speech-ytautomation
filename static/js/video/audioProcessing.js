/**
 * Audio decoding and pitch-preserving time-stretching (WSOLA).
 */

export const SAMPLE_RATE = 48000;

export async function decodeAudio(url) {
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

/** Pitch-preserving time stretch (WSOLA), tuned for speech. */
export function timeStretchChannels(channels, speed) {
  const inLen = channels[0].length;
  const N = Math.round(SAMPLE_RATE * 0.03) & ~7; // ~30ms window, multiple of 8
  const Hs = N / 2;                               // synthesis hop
  const Ha = Hs * speed;                          // analysis hop
  const delta = Math.round(SAMPLE_RATE * 0.01);   // ±10ms search tolerance
  const D = 8;                                     // decimation for similarity search

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

export function processAudio(channels, { speed, volume, preservePitch }) {
  let out = channels;
  if (Math.abs(speed - 1) > 1e-3) {
    out = preservePitch ? timeStretchChannels(out, speed) : resampleChannels(out, speed);
  }
  if (Math.abs(volume - 1) > 1e-3) {
    for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= volume;
  }
  return out;
}
