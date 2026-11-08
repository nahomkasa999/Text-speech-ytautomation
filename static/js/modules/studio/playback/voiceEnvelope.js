/**
 * Voice loudness envelope for "Move with the voice" player animations.
 * The server measures the narration once (30 values per second, 0-255); here we
 * load it into the scene so the renderer can look up the level at any time.
 */

let loadToken = 0;

export async function loadVoiceEnvelope(scene, audioUrl) {
  const token = ++loadToken;
  scene.voiceEnvelope = null;
  const name = (audioUrl || '').split('?')[0].split('/').pop();
  if (!name) return;
  try {
    const res = await fetch(`/api/voice-envelope/${encodeURIComponent(name)}`);
    if (!res.ok || token !== loadToken) return;
    const { fps, data } = await res.json();
    const bin = atob(data || '');
    const levels = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) levels[i] = bin.charCodeAt(i);
    scene.voiceEnvelope = { fps, levels };
  } catch (e) {
    console.warn('Could not load voice envelope:', e);
  }
}

/** Voice level 0..1 at time t (seconds), linearly interpolated. */
export function voiceLevelAt(envelope, t) {
  if (!envelope || !envelope.levels.length) return 0;
  const pos = Math.max(0, t) * envelope.fps;
  const i = Math.floor(pos);
  const n = envelope.levels.length;
  if (i >= n - 1) return envelope.levels[n - 1] / 255;
  const f = pos - i;
  return (envelope.levels[i] * (1 - f) + envelope.levels[i + 1] * f) / 255;
}
