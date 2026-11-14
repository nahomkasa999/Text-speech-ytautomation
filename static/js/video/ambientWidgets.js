/**
 * Wave animations for the audio player widget.
 *
 * By default they move on their own (driven only by time). With "Move with
 * the voice" on, their size follows the narration's loudness envelope
 * (precomputed on the server), while the flowing motion keeps going.
 *
 * Colours: every style is made of 2-3 colour layers. They are either derived
 * automatically from one main colour (layer.autoPalette, the default) or set
 * one by one (layer.palette). An optional glow (layer.glow, 0..1) is added by
 * drawing a blurred copy behind the wave.
 *
 * Everything is deterministic (no randomness), so the exported video matches
 * the preview frame for frame.
 */

const TAU = Math.PI * 2;

/** How many colour layers each style uses (shown as swatches in the inspector). */
export const STYLE_LAYERS = {
  ambient_flow: 3,
  ambient_ocean: 3,
  ambient_ribbon: 3,
  ambient_pulse: 2,
  ambient_dots: 2,
  ambient_glow: 2,
  ambient_shimmer: 2,
};

// ---------- colour helpers ----------

function hexToHsl(hex) {
  let h = String(hex || '#111827').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return [hue * 60, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Harmonious layer colours from one main colour: layer 1 is the colour
 * itself, the next layers step towards lighter (or, for very light colours,
 * deeper) tones with a slight warm hue shift, like the gold → pale gold glow.
 */
export function autoPalette(base, count) {
  const [h, s, l] = hexToHsl(base);
  const lighten = l < 0.72;
  const out = [hslToHex(h, s, l)];
  for (let i = 1; i < count; i++) {
    const step = i / Math.max(1, count - 1);
    const nl = lighten ? l + (0.93 - l) * (0.45 + 0.4 * step) * step : l - 0.42 * step;
    out.push(hslToHex(h + 6 * step, s * (lighten ? 1 - 0.25 * step : 1), nl));
  }
  return out;
}

/** The colours a layer actually uses, honouring manual overrides. */
export function layerColors(layer) {
  const count = STYLE_LAYERS[layer.widgetStyle] || 3;
  const auto = autoPalette(layer.color || '#111827', count);
  if (layer.autoPalette !== false || !Array.isArray(layer.palette)) return auto;
  return auto.map((c, i) => (typeof layer.palette[i] === 'string' && layer.palette[i]) || c);
}

// ---------- geometry helpers ----------

function band(layer) {
  // Any size: tiny accents up to full-screen waves (the canvas is 1080px tall).
  const h = Math.max(16, Math.min(layer.height || 100, 2160));
  // k scales strokes, bars, dots and glow with the size (1 = the default 100px).
  return { x: layer.x, y: layer.y, w: Math.max(40, layer.width), h, cy: layer.y + h / 2, k: h / 100 };
}

/** Fades waves out towards both ends so they never stop abruptly. */
function edge(u) {
  return Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.8);
}

function strokeWave(ctx, b, { amp, freq, speed, phase, t, width, alpha, color }) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
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

/** Vertical gradient: `inner` along the centre line, `outer` at the top/bottom. */
function mirrorGradient(ctx, b, inner, outer, reach = 0.5) {
  const g = ctx.createLinearGradient(0, b.cy - b.h * reach, 0, b.cy + b.h * reach);
  g.addColorStop(0, outer);
  g.addColorStop(0.5, inner);
  g.addColorStop(1, outer);
  return g;
}

// ---------- styles (c = layer colours) ----------

/** Flow: three soft sine lines drifting at different speeds. */
function drawFlow(ctx, b, t, c, thickness, energy) {
  ctx.lineCap = 'round';
  const amp = b.h * 0.32 * (energy ?? 1);
  strokeWave(ctx, b, { amp: amp * 0.55, freq: 3.1, speed: 1.6, phase: 3.1, t, width: thickness * 0.6, alpha: 0.45, color: c[2] });
  strokeWave(ctx, b, { amp: amp * 0.75, freq: 2.3, speed: -0.8, phase: 1.7, t, width: thickness * 0.8, alpha: 0.7, color: c[1] });
  strokeWave(ctx, b, { amp, freq: 1.6, speed: 1.1, phase: 0, t, width: thickness, alpha: 1, color: c[0] });
}

/** Ocean: layered filled waves rolling past each other (back = lightest). */
function drawOcean(ctx, b, t, c, thickness, energy) {
  const e = energy ?? 1;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(b.x, b.y, b.w, b.h, 14 * Math.min(b.k, 4)) : ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  const layers = [
    { amp: 0.22, freq: 1.2, speed: 0.6, phase: 0.0, level: 0.38, alpha: 0.55, color: c[2] },
    { amp: 0.18, freq: 1.9, speed: -0.9, phase: 2.1, level: 0.52, alpha: 0.75, color: c[1] },
    { amp: 0.14, freq: 2.6, speed: 1.3, phase: 4.0, level: 0.66, alpha: 0.95, color: c[0] },
  ];
  const steps = Math.max(60, Math.round(b.w / 6));
  layers.forEach(l => {
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = l.color;
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
function drawRibbon(ctx, b, t, c, thickness, energy) {
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
  ctx.fillStyle = c[1];
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  top.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
  ctx.closePath();
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, thickness * 0.7);
  [[top, c[0], 1], [bottom, c[2], 0.8]].forEach(([pts, color, alpha]) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  });
}

/** Pulse: rounded bars breathing in a travelling wave. */
function drawPulse(ctx, b, t, c, thickness, energy) {
  const e = energy ?? 1;
  const barW = Math.max(3, Math.min(10 * b.k, b.w / 90));
  const gap = barW * 0.7;
  const count = Math.floor(b.w / (barW + gap));
  const offset = b.x + (b.w - count * (barW + gap) + gap) / 2;
  ctx.fillStyle = mirrorGradient(ctx, b, c[0], c[1]);
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const wave = 0.5 + 0.5 * Math.sin(i * 0.33 - t * 2.4);
    const swell = 0.6 + 0.4 * Math.sin(i * 0.09 + t * 0.8);
    const hBar = Math.max(barW, b.h * (0.12 + 0.82 * wave * swell * e) * (0.35 + 0.65 * edge(u)));
    ctx.globalAlpha = 0.55 + 0.45 * wave;
    const bx = offset + i * (barW + gap);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, b.cy - hBar / 2, barW, hBar, barW / 2) : ctx.rect(bx, b.cy - hBar / 2, barW, hBar);
    ctx.fill();
  }
}

/** Dot wave: a row of dots rising and falling like a stadium wave. */
function drawDots(ctx, b, t, c, thickness, energy) {
  const e = energy ?? 1;
  const spacing = Math.max(10, Math.min(28 * b.k, b.w / 40));
  const count = Math.floor(b.w / spacing);
  const offset = b.x + (b.w - (count - 1) * spacing) / 2;
  ctx.fillStyle = mirrorGradient(ctx, b, c[0], c[1], 0.4);
  for (let i = 0; i < count; i++) {
    const u = i / Math.max(1, count - 1);
    const phase = Math.sin(i * 0.42 - t * 2.6);
    const lift = phase * b.h * 0.32 * edge(u) * e;
    const r = Math.max(2.5, spacing * (0.16 + 0.1 * (phase + 1) / 2));
    ctx.globalAlpha = 0.45 + 0.55 * (phase + 1) / 2;
    ctx.beginPath();
    ctx.arc(offset + i * spacing, b.cy - lift, r, 0, TAU);
    ctx.fill();
  }
}

/** Breathe: a glowing line that softly breathes, with a light gliding back and forth. */
function drawBreathe(ctx, b, t, c, thickness, energy) {
  // Synced: the glow breathes with the voice. Free: it breathes on its own.
  const breath = energy == null ? 0.5 + 0.5 * Math.sin(t * 1.3) : energy;
  ctx.lineCap = 'round';
  ctx.shadowColor = c[0];
  ctx.shadowBlur = (8 + breath * 22) * b.k;
  const amp = b.h * 0.12 * (0.4 + breath * 0.6);
  strokeWave(ctx, b, { amp, freq: 1.0, speed: 0.9, phase: 0, t, width: thickness, alpha: 0.75 + breath * 0.25, color: c[0] });

  // A soft light gliding along the line with an ease-in-out back-and-forth motion.
  const u = 0.5 - 0.5 * Math.cos(t * 0.6);
  const px = b.x + 0.08 * b.w + u * b.w * 0.84;
  const py = b.cy + Math.sin(u * 1.0 * TAU + t * 0.9) * amp * edge(u);
  const glowR = (26 + breath * 10) * b.k;
  const glow = ctx.createRadialGradient(px, py, 0, px, py, glowR);
  glow.addColorStop(0, c[1]);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, glowR, 0, TAU);
  ctx.fill();
}

/**
 * Gold glow (the client's reference): symmetric glowing bars with several
 * peaks, fading out towards both ends. Best with Glow turned up.
 */
function drawShimmer(ctx, b, t, c, thickness, energy) {
  const e = energy ?? 1;
  const barW = Math.max(2.5, 5.5 * b.k);
  const gap = barW * 1.5;
  const count = Math.max(8, Math.floor(b.w / (barW + gap)));
  const offset = b.x + (b.w - count * (barW + gap) + gap) / 2;

  ctx.fillStyle = mirrorGradient(ctx, b, c[0], c[1]);
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    // A few smooth peaks drifting slowly, plus a fast flicker per bar.
    const peaks = 0.55 + 0.45 * Math.sin(u * 3.2 * TAU - t * 1.1) * Math.sin(u * 1.3 * TAU + t * 0.6);
    const flicker = 0.55 + 0.45 * Math.sin(i * 1.7 + t * 6.3) * Math.sin(i * 0.37 - t * 2.9);
    const env = Math.pow(Math.sin(Math.PI * u), 1.6);
    const hBar = Math.max(barW, b.h * 0.95 * env * (0.18 + 0.82 * peaks * flicker * e));
    ctx.globalAlpha = 0.7 + 0.3 * flicker;
    const bx = offset + i * (barW + gap);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, b.cy - hBar / 2, barW, hBar, barW / 2) : ctx.rect(bx, b.cy - hBar / 2, barW, hBar);
    ctx.fill();
  }
}

const AMBIENT = {
  ambient_flow: drawFlow,
  ambient_ocean: drawOcean,
  ambient_ribbon: drawRibbon,
  ambient_pulse: drawPulse,
  ambient_dots: drawDots,
  ambient_glow: drawBreathe,
  ambient_shimmer: drawShimmer,
};

export function isAmbientStyle(style) {
  return Object.prototype.hasOwnProperty.call(AMBIENT, style);
}

function glowOf(layer) {
  return Math.max(0, Math.min(1, Number(layer.glow) || 0));
}

function blurOf(b, glow) {
  return (4 + glow * 22) * b.k;
}

// Room around the band for wave peaks and line glow.
function padOf(b, glow) {
  return Math.ceil(Math.max(48 * b.k, glow * 60 * b.k) + 8);
}

/**
 * The box drawAmbientWidget paints inside, in scene units. The export redraws
 * and uploads only this box while the rest of the picture stands still.
 * @param scale  output pixels per scene unit; the glow blur does not shrink with it
 */
export function ambientBounds(layer, scale = 1) {
  const b = band(layer);
  const glow = glowOf(layer);
  const pad = padOf(b, glow);
  // A blur fades out within three standard deviations.
  const spread = glow > 0 ? Math.ceil(3 * blurOf(b, glow) / Math.min(1, scale)) : 0;
  return {
    x: b.x - pad - spread, y: b.y - pad - spread,
    width: Math.ceil(b.w + pad * 2) + spread * 2, height: Math.ceil(b.h + pad * 2) + spread * 2,
  };
}

// One reusable scratch canvas for the glow pass.
const scratchCanvases = new Map();
function getScratch(w, h, willReadFrequently) {
  let scratch = scratchCanvases.get(willReadFrequently);
  if (!scratch) {
    scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    scratch.getContext('2d', { willReadFrequently });
    scratchCanvases.set(willReadFrequently, scratch);
  }
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  return scratch;
}

/**
 * @param t       seconds of animation time (video time on export, wall clock while idle in the editor)
 * @param energy  null = move freely; 0..1 = follow the voice loudness ("Move with the voice")
 */
export function drawAmbientWidget(ctx, layer, t, color, energy = null) {
  const fn = AMBIENT[layer.widgetStyle];
  if (!fn) return;
  const b = band(layer);
  const colors = layerColors({ ...layer, color: layer.color || color });
  // Line thickness grows with the size so big waves don't look thin.
  const thickness = Math.max(1.2, (layer.thickness || 3) * b.k);
  const glow = glowOf(layer);

  // Draw into a scratch canvas, then composite: this keeps the layer's own
  // opacity/rotation (set on ctx by the renderer) and makes the glow cheap.
  const pad = padOf(b, glow);
  const sw = Math.ceil(b.w + pad * 2);
  const sh = Math.ceil(b.h + pad * 2);
  const off = getScratch(sw, sh, ctx.getContextAttributes?.().willReadFrequently ?? false);
  const octx = off.getContext('2d');
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, sw, sh);
  octx.save();
  octx.translate(pad - b.x, pad - b.y);
  fn(octx, b, t, colors, thickness, energy);
  octx.restore();

  ctx.save();
  if (glow > 0) {
    ctx.filter = `blur(${blurOf(b, glow)}px)`;
    ctx.globalAlpha *= Math.min(1, 0.55 + glow * 0.6);
    ctx.drawImage(off, 0, 0, sw, sh, b.x - pad, b.y - pad, sw, sh);
    ctx.filter = 'none';
    ctx.globalAlpha /= Math.min(1, 0.55 + glow * 0.6);
  }
  ctx.drawImage(off, 0, 0, sw, sh, b.x - pad, b.y - pad, sw, sh);
  ctx.restore();
}
