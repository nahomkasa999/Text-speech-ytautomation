/**
 * Renderers for Shape, Image, Video, and Frame Layers.
 */

import { drawRoundedRectPath } from './canvasUtils.js';

export function drawShapeLayer(ctx, layer) {
  ctx.save();
  ctx.fillStyle = layer.fill || '#0D99FF';

  if (layer.shapeType === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      layer.x + layer.width / 2, layer.y + layer.height / 2,
      layer.width / 2, layer.height / 2,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    if (layer.stroke && layer.stroke.width > 0) {
      ctx.strokeStyle = layer.stroke.color || '#FFFFFF';
      ctx.lineWidth = layer.stroke.width;
      ctx.stroke();
    }
  } else if (layer.shapeType === 'line') {
    ctx.strokeStyle = layer.fill || '#FFFFFF';
    ctx.lineWidth = Math.max(1, layer.height);
    ctx.beginPath();
    ctx.moveTo(layer.x, layer.y + layer.height / 2);
    ctx.lineTo(layer.x + layer.width, layer.y + layer.height / 2);
    ctx.stroke();
  } else {
    drawRoundedRectPath(ctx, layer.x, layer.y, layer.width, layer.height, layer.cornerRadius);
    ctx.fill();
    if (layer.stroke && layer.stroke.width > 0) {
      ctx.strokeStyle = layer.stroke.color || '#FFFFFF';
      ctx.lineWidth = layer.stroke.width;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawImageLayer(ctx, layer) {
  if (!layer._loadedImage && layer.src) {
    if (layer._loadingSrc !== layer.src) {
      const src = layer.src;
      layer._loadingSrc = src;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { if (layer._loadingSrc === src) layer._loadedImage = img; };
      img.src = src;
    }
    return;
  }

  if (layer._loadedImage) {
    ctx.save();
    drawRoundedRectPath(ctx, layer.x, layer.y, layer.width, layer.height, layer.cornerRadius);
    ctx.clip();
    ctx.drawImage(layer._loadedImage, layer.x, layer.y, layer.width, layer.height);
    ctx.restore();
  }
}

export function drawVideoLayer(ctx, layer, currentTime) {
  if (!layer._videoEl && layer.src) {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.src = layer.src;
    layer._videoEl = v;
  }
  if (layer._videoEl) {
    const v = layer._videoEl;
    const start = layer.startTime || 0;
    const relTime = Math.max(0, currentTime - start);
    if (Math.abs(v.currentTime - relTime) > 0.15 && !v.seeking) {
      v.currentTime = relTime;
    }
    if (v.readyState >= 2) {
      ctx.save();
      drawRoundedRectPath(ctx, layer.x, layer.y, layer.width, layer.height, layer.cornerRadius);
      ctx.clip();
      ctx.drawImage(v, layer.x, layer.y, layer.width, layer.height);
      ctx.restore();
    }
  }
}

export function drawFrameLayer(ctx, layer, scene, currentTime, drawTextFn) {
  const { x, y, width, height, cornerRadius, fill, stroke, clipContent } = layer;

  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, cornerRadius);

  if (fill && fill !== 'transparent') {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && stroke.width > 0) {
    ctx.strokeStyle = stroke.color || '#444444';
    ctx.lineWidth = stroke.width;
    ctx.stroke();
  }
  if (clipContent) ctx.clip();

  if (Array.isArray(layer.children) && layer.children.length > 0) {
    layer.children.forEach(childId => {
      const child = scene.getLayer(childId);
      if (child && child.visible && currentTime >= child.startTime && currentTime <= child.endTime) {
        ctx.save();
        ctx.translate(x, y);
        if (child.type === 'text') drawTextFn(ctx, child);
        else if (child.type === 'shape') drawShapeLayer(ctx, child);
        ctx.restore();
      }
    });
  }
  ctx.restore();
}
