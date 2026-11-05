/**
 * Advanced Audio Player Bar Widget Templates (Capsule, Gradient Pill, Equalizer, Minimal Dots).
 */

import { drawRoundedRectPath, formatWidgetTime } from './canvasUtils.js';

export function drawCapsuleWidget(ctx, layer, progress, color, currentTime, duration) {
  const { x, y, width: trackW } = layer;
  const capsuleH = 54, radius = capsuleH / 2;

  ctx.fillStyle = 'rgba(24, 24, 27, 0.88)';
  drawRoundedRectPath(ctx, x, y, trackW, capsuleH, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const playCx = x + 28, playCy = y + radius;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(playCx, playCy, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(playCx - 3, playCy - 6);
  ctx.lineTo(playCx + 5, playCy);
  ctx.lineTo(playCx - 3, playCy + 6);
  ctx.closePath();
  ctx.fill();

  const barX = x + 54, barY = y + radius, barW = Math.max(50, trackW - 170);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW, barY);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + (barW * progress), barY);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(barX + (barW * progress), barY, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F3F4F6';
  ctx.font = "600 12px 'Inter', monospace";
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${formatWidgetTime(currentTime)} / ${formatWidgetTime(duration)}`, x + trackW - 18, y + radius);
}

export function drawMinimalDotsWidget(ctx, layer, progress, color, drawTransportIcons) {
  const { x, y, width: trackW } = layer;
  const dotCount = 28, barY = y + 14, step = trackW / (dotCount - 1);
  for (let i = 0; i < dotCount; i++) {
    const frac = i / (dotCount - 1);
    ctx.fillStyle = color;
    ctx.globalAlpha = frac <= progress ? 1.0 : 0.25;
    ctx.beginPath();
    ctx.arc(x + i * step, barY, frac <= progress ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (layer.showControls) drawTransportIcons(ctx, x + trackW / 2, barY + 36, color);
}

export function drawEqualizerWidget(ctx, layer, progress, color, currentTime, drawTransportIcons) {
  const { x, y, width: trackW } = layer;
  const barCount = 36, barW = (trackW / barCount) * 0.65, gap = (trackW / barCount) * 0.35, baseY = y + 44;
  for (let i = 0; i < barCount; i++) {
    const frac = i / (barCount - 1);
    const isPlayed = frac <= progress;
    const t = currentTime * 4.2;
    const rawH = 8 + Math.abs(Math.sin(i * 0.45 + t) * 16 + Math.cos(i * 0.85 - t * 0.8) * 12 + Math.sin(i * 1.4 + t * 1.5) * 6);
    const h = Math.max(6, Math.min(50, rawH));
    const bx = x + i * (barW + gap), by = baseY - h;

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = isPlayed ? 1.0 : 0.28;
    drawRoundedRectPath(ctx, bx, by, barW, h, barW / 2);
    ctx.fill();
    if (isPlayed) {
      ctx.globalAlpha = 0.85;
      ctx.fillRect(bx, by - 6, barW, 2);
    }
    ctx.restore();
  }
  if (layer.showControls) drawTransportIcons(ctx, x + trackW / 2, baseY + 32, color);
}

export function drawGradientPillWidget(ctx, layer, progress, color, currentTime, duration) {
  const { x, y, width: trackW } = layer;
  const pillH = 46, radius = pillH / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(18, 18, 22, 0.72)';
  drawRoundedRectPath(ctx, x, y, trackW, pillH, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const playCx = x + 24, playCy = y + radius;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(playCx, playCy, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(playCx - 2.5, playCy - 5);
  ctx.lineTo(playCx + 4.5, playCy);
  ctx.lineTo(playCx - 2.5, playCy + 5);
  ctx.closePath();
  ctx.fill();

  const barX = x + 48, barY = y + radius, barW = Math.max(40, trackW - 165);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW, barY);
  ctx.stroke();

  const playedW = barW * progress;
  if (playedW > 0) {
    const grad = ctx.createLinearGradient(barX, barY, barX + playedW, barY);
    grad.addColorStop(0, '#0D99FF');
    grad.addColorStop(1, '#A855F7');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + playedW, barY);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#0D99FF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(barX + playedW, barY, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#E5E7EB';
  ctx.font = "600 11.5px 'Inter', monospace";
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${formatWidgetTime(currentTime)} / ${formatWidgetTime(duration)}`, x + trackW - 16, y + radius);
  ctx.restore();
}
