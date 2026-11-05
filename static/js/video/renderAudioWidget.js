/**
 * Core Audio Player Bar Widget Overlay and classic/waveform/glow templates.
 */

import { drawRoundedRectPath } from './canvasUtils.js';
import {
  drawCapsuleWidget,
  drawMinimalDotsWidget,
  drawEqualizerWidget,
  drawGradientPillWidget
} from './widgetTemplates.js';

export function drawAudioWidgetLayer(ctx, layer, scene, currentTime) {
  const duration = scene.duration || 10;
  const progress = Math.min(1, Math.max(0, currentTime / duration));
  const color = layer.color || '#111827';
  const style = layer.widgetStyle || 'classic';

  ctx.save();
  switch (style) {
    case 'waveform': drawWaveformWidget(ctx, layer, progress, color); break;
    case 'capsule': drawCapsuleWidget(ctx, layer, progress, color, currentTime, duration); break;
    case 'glow_line': drawGlowLineWidget(ctx, layer, progress, color); break;
    case 'minimal_dots': drawMinimalDotsWidget(ctx, layer, progress, color, drawWidgetTransportIcons); break;
    case 'equalizer': drawEqualizerWidget(ctx, layer, progress, color, currentTime, drawWidgetTransportIcons); break;
    case 'gradient_pill': drawGradientPillWidget(ctx, layer, progress, color, currentTime, duration); break;
    default: drawClassicLineWidget(ctx, layer, progress, color); break;
  }
  ctx.restore();
}

function drawClassicLineWidget(ctx, layer, progress, color) {
  const { x, y, width: trackW } = layer;
  const barY = y + 12;
  const thickness = layer.thickness || 2.5;

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, barY);
  ctx.lineTo(x + trackW, barY);
  ctx.stroke();

  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  ctx.moveTo(x, barY);
  ctx.lineTo(x + (trackW * progress), barY);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + (trackW * progress), barY, layer.playheadRadius || 7, 0, Math.PI * 2);
  ctx.fill();

  if (layer.showControls) drawWidgetTransportIcons(ctx, x + trackW / 2, barY + 36, color);
}

function drawWaveformWidget(ctx, layer, progress, color) {
  const { x, y, width: trackW } = layer;
  const barCount = 42;
  const barW = (trackW / barCount) * 0.65;
  const gap = (trackW / barCount) * 0.35;
  const centerY = y + 28;

  for (let i = 0; i < barCount; i++) {
    const frac = i / (barCount - 1);
    const rawH = 8 + Math.abs(Math.sin(i * 0.45) * 22 + Math.cos(i * 0.9) * 14);
    const h = Math.max(6, Math.min(46, rawH));
    const bx = x + i * (barW + gap);
    const by = centerY - h / 2;

    ctx.fillStyle = color;
    ctx.globalAlpha = frac <= progress ? 1.0 : 0.28;
    drawRoundedRectPath(ctx, bx, by, barW, h, barW / 2);
    ctx.fill();
  }
  if (layer.showControls) drawWidgetTransportIcons(ctx, x + trackW / 2, centerY + 36, color);
}

function drawGlowLineWidget(ctx, layer, progress, color) {
  const { x, y, width: trackW } = layer;
  const barY = y + 14;

  ctx.strokeStyle = 'rgba(150, 150, 150, 0.25)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, barY);
  ctx.lineTo(x + trackW, barY);
  ctx.stroke();

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, barY);
  ctx.lineTo(x + (trackW * progress), barY);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(x + (trackW * progress), barY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (layer.showControls) drawWidgetTransportIcons(ctx, x + trackW / 2, barY + 36, color);
}

export function drawWidgetTransportIcons(ctx, centerX, controlsY, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(centerX - 46, controlsY - 9); ctx.lineTo(centerX - 56, controlsY); ctx.lineTo(centerX - 46, controlsY + 9);
  ctx.moveTo(centerX - 56, controlsY - 9); ctx.lineTo(centerX - 66, controlsY); ctx.lineTo(centerX - 56, controlsY + 9);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX - 5, controlsY - 9); ctx.lineTo(centerX - 5, controlsY + 9);
  ctx.moveTo(centerX + 5, controlsY - 9); ctx.lineTo(centerX + 5, controlsY + 9);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX + 46, controlsY - 9); ctx.lineTo(centerX + 56, controlsY); ctx.lineTo(centerX + 46, controlsY + 9);
  ctx.moveTo(centerX + 56, controlsY - 9); ctx.lineTo(centerX + 66, controlsY); ctx.lineTo(centerX + 56, controlsY + 9);
  ctx.stroke();
  ctx.restore();
}
