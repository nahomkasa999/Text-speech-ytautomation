/**
 * Unified 60fps Canvas Renderer for Video Studio.
 * Shared identically by preview and MP4 export.
 */

import { formatTextCasing, measureTextLayout } from './textMeasurement.js';
import { drawTextLayer, drawTranscriptionLayer } from './renderTextLayer.js';
import { drawShapeLayer, drawImageLayer, drawFrameLayer } from './renderShapeLayer.js';
import { drawAudioWidgetLayer } from './renderAudioWidget.js';

export { formatTextCasing, measureTextLayout };

export function renderScene(ctx, scene, options = {}) {
  const {
    currentTime = scene.currentTime || 0,
    bgImage = null
  } = options;

  const canvasW = scene.canvas.width || 1920;
  const canvasH = scene.canvas.height || 1080;

  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, canvasW, canvasH);
  } else if (scene.canvas.background) {
    ctx.fillStyle = scene.canvas.background;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const activeLayers = scene.layers.filter(layer => {
    if (!layer.visible) return false;
    if (layer.type === 'transcription' || layer.type === 'audio_widget' ||
        layer.id === 'layer_captions' || layer.id === 'layer_player_widget') {
      return true;
    }
    const start = typeof layer.startTime === 'number' ? layer.startTime : 0;
    const end = typeof layer.endTime === 'number' ? layer.endTime : 999999;
    return currentTime >= start && currentTime <= end;
  });

  activeLayers.forEach(layer => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;

    if (layer.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    switch (layer.type) {
      case 'frame':
        drawFrameLayer(ctx, layer, scene, currentTime, drawTextLayer);
        break;
      case 'text':
        drawTextLayer(ctx, layer);
        break;
      case 'transcription':
        drawTranscriptionLayer(ctx, layer, scene, currentTime);
        break;
      case 'image':
        drawImageLayer(ctx, layer);
        break;
      case 'shape':
        drawShapeLayer(ctx, layer);
        break;
      case 'audio_widget':
        drawAudioWidgetLayer(ctx, layer, scene, currentTime);
        break;
      default:
        break;
    }

    ctx.restore();
  });

  ctx.restore();
}
