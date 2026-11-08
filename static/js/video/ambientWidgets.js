/**
 * Ambient "always moving" player animations.
 *
 * By default they move on their own (driven only by time). With "Move with
 * the voice" on, their size follows the narration's loudness envelope
 * (precomputed on the server), while the flowing motion keeps going. Everything is deterministic
 * (no randomness), so the exported video matches the preview frame for frame.
 */

const TAU = Math.PI * 2;

function band(layer) {
  const h = Math.max(40, Math.min(layer.height || 100, 220));
  return { x: layer.x, y: layer.y, w: Math.max(60, layer.width), h, cy: layer.y + h / 2 };
}

/** Fades waves out towards both ends so they never stop abruptly. */
function edge(u) {
  return Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.8);
}

function strokeWave(ctx, b, { amp, freq, speed, phase, t, width, alpha }) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.beginPath();
  const steps = Math.max(60, Math.round(b.w / 6));
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const px = b.x + u * b.w;
    const py = b.cy + Math.sin(u * freq * TAU + phase + t * speed) * amp * edge(u);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/** Flow: three soft sine lines drifting at different speeds. */
function drawFlow(ctx, b, t, color, thickness, energy) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const amp = b.h * 0.32 * (energy ?? 1);
  strokeWave(ctx, b, { amp, freq: 1.6, speed: 1.1, phase: 0, t, width: thickness, alpha: 0.95 });
  strokeWave(ctx, b, { amp: amp * 0.75, freq: 2.3, speed: -0.8, phase: 1.7, t, width: thickness * 0.8, alpha: 0.55 });
  strokeWave(ctx, b, { amp: amp * 0.55, freq: 3.1, speed: 1.6, phase: 3.1, t, width: thickness * 0.6, alpha: 0.3 });
}

/** Ocean: layered filled waves rolling past each other. */
function drawOcean(ctx, b, t, color, thickness, energy) {
  const e = energy ?? 1;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(b.x, b.y, b.w, b.h, 14) : ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  ctx.fillStyle = color;
  const layers = [
    { amp: 0.22, freq: 1.2, speed: 0.6, phase: 0.0, level: 0.38, alpha: 0.18 },
    { amp: 0.18, freq: 1.9, speed: -0.9, phase: 2.1, level: 0.52, alpha: 0.32 },
    { amp: 0.14, freq: 2.6, speed: 1.3, phase: 4.0, level: 0.66, alpha: 0.55 },
  ];
  const steps = Math.max(60, Math.round(b.w / 6));
  layers.forEach(l => {
    ctx.globalAlpha = l.alpha;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      // Quiet voice: calmer, lower water. Loud voice: taller, livelier waves.
      const py = b.y + b.h * (l.level + (1 - e) * 0.22) + Math.sin(u * l.freq * TAU + l.phase + t * l.speed) * b.h * l.amp * e;
      ctx.lineTo(b.x + u * b.w, py);
    }
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

/** Ribbon: two crossing waves with a soft fill between them, like twisting silk. */
function drawRibbon(ctx, b, t, color, thickness, energy) {
  const amp = energy ?? 1;
  const steps = Math.max(60, Math.round(b.w / 6));
  const top = [];
  const bottom = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const e = edge(u) * amp;
    const s = Math.sin(u * 2.2 * TAU + t * 1.2);
    const twist = Math.sin(u * 1.1 * TAU - t * 0.7);
    const px = b.x + u * b.w;
    top.push([px, b.cy + (s * 0.3 - twist * 0.18) * b.h * e]);
    bottom.push([px, b.cy + (s * 0.3 + twist * 0.18) * b.h * e]);
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  top.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, thickness * 0.7);
  [top, bottom].forEach((pts, k) => {
    ctx.globalAlpha = k ? 0.6 : 0.95;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  });
}

/** Pulse: rounded bars breathing in a travelling wave (looks like music, isn't tied to it). */
function drawPulse(ctx, b, t, color, thickness, energy) {
  const e = energy ?? 1;
  const gap = 6;
  const barW = Math.max(4, Math.min(10, b.w / 90));
  const count = Math.floor(b.w / (barW + gap));
  const offset = b.x + (b.w - count * (barW + gap) + gap) / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const wave = 0.5 + 0.5 * Math.sin(i * 0.33 - t * 2.4);
    const swell = 0.6 + 0.4 * Math.sin(i * 0.09 + t * 0.8);
    const hBar = Math.max(barW, b.h * (0.12 + 0.82 * wave * swell * e) * (0.35 + 0.65 * edge(u)));
    ctx.globalAlpha = 0.45 + 0.55 * wave;
    const bx = offset + i * (barW + gap);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, b.cy - hBar / 2, barW, hBar, barW / 2) : ctx.rect(bx, b.cy - hBar / 2, barW, hBar);
    ctx.fill();
  }
}

/** Dot wave: a row of dots rising and falling like a stadium wave. */
function drawDots(ctx, b, t, color, thickness, energy) {
  const e = energy ?? 1;
  const spacing = Math.max(16, Math.min(28, b.w / 40));
  const count = Math.floor(b.w / spacing);
  const offset = b.x + (b.w - (count - 1) * spacing) / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const u = i / Math.max(1, count - 1);
    const phase = Math.sin(i * 0.42 - t * 2.6);
    const lift = phase * b.h * 0.32 * edge(u) * e;
    const r = Math.max(2.5, spacing * (0.16 + 0.1 * (phase + 1) / 2));
    ctx.globalAlpha = 0.35 + 0.65 * (phase + 1) / 2;
    ctx.beginPath();
    ctx.arc(offset + i * spacing, b.cy - lift, r, 0, TAU);
    ctx.fill();
  }
}

/** Breathe: a glowing line that softly breathes, with a light gliding back and forth. */
function drawBreathe(ctx, b, t, color, thickness, energy) {
  // Synced: the glow breathes with the voice. Free: it breathes on its own.
  const breath = energy == null ? 0.5 + 0.5 * Math.sin(t * 1.3) : energy;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8 + breath * 22;
  strokeWave(ctx, b, { amp: b.h * 0.12 * (0.4 + breath * 0.6), freq: 1.0, speed: 0.9, phase: 0, t, width: thickness, alpha: 0.75 + breath * 0.25 });

  // A soft light gliding along the line with an ease-in-out back-and-forth motion.
  const u = 0.5 - 0.5 * Math.cos(t * 0.6);
  const px = b.x + 0.08 * b.w + u * b.w * 0.84;
  const py = b.cy + Math.sin(u * 1.0 * TAU + t * 0.9) * b.h * 0.12 * (0.4 + breath * 0.6) * edge(u);
  const glow = ctx.createRadialGradient(px, py, 0, px, py, 26 + breath * 10);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, 26 + breath * 10, 0, TAU);
  ctx.fill();
}

const AMBIENT = {
  ambient_flow: drawFlow,
  ambient_ocean: drawOcean,
  ambient_ribbon: drawRibbon,
  ambient_pulse: drawPulse,
  ambient_dots: drawDots,
  ambient_glow: drawBreathe,
};

export function isAmbientStyle(style) {
  return Object.prototype.hasOwnProperty.call(AMBIENT, style);
}

/**
 * @param t       seconds of animation time (video time on export, wall clock while idle in the editor)
 * @param energy  null = move freely; 0..1 = follow the voice loudness ("Move with the voice")
 */
export function drawAmbientWidget(ctx, layer, t, color, energy = null) {
  const fn = AMBIENT[layer.widgetStyle];
  if (!fn) return;
  ctx.save();
  fn(ctx, band(layer), t, color, Math.max(1.5, layer.thickness || 3), energy);
  ctx.restore();
}
