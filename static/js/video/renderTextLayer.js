/**
 * Renderers for TextLayer and TranscriptionLayer (Synced Captions).
 */

import { measureTextLayout } from './textMeasurement.js';

export function drawTextLayer(ctx, layer) {
  const layout = measureTextLayout(ctx, layer);
  const { lines, lineHeight, measuredFontSize } = layout;
  if (!lines || lines.length === 0) return;

  ctx.save();
  ctx.font = `${layer.fontWeight || '700'} ${measuredFontSize}px ${layer.fontFamily || "'Merriweather', serif"}`;
  ctx.fillStyle = layer.fill || '#FFFFFF';
  ctx.textBaseline = 'top';

  if (layer.shadow && layer.shadow.blur > 0) {
    ctx.shadowColor = layer.shadow.color || 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetX = layer.shadow.x || 0;
    ctx.shadowOffsetY = layer.shadow.y || 0;
  }

  if (typeof layer.anchorCenterY !== 'number') {
    layer.anchorCenterY = layer.y + (layer.height || layout.totalHeight) / 2;
  }

  let startY = layer.y;
  const vAlign = layer.verticalAlign || 'top';
  if (vAlign === 'middle') {
    startY = layer.anchorCenterY - (layout.totalHeight / 2);
  } else if (vAlign === 'bottom') {
    startY = (layer.anchorCenterY + (layer.height || layout.totalHeight) / 2) - layout.totalHeight;
  }

  layer.renderedTop = startY;
  layer.renderedHeight = layout.totalHeight;

  lines.forEach((lineText, idx) => {
    const cleanLine = lineText.replace('\n', '');
    const lineWidth = ctx.measureText(cleanLine).width;
    let lineX = layer.x;

    if (layer.align === 'center') lineX = layer.x + (layer.width - lineWidth) / 2;
    else if (layer.align === 'right') lineX = layer.x + (layer.width - lineWidth);

    ctx.fillText(cleanLine, lineX, startY + idx * lineHeight);

    if (layer.stroke && layer.stroke.width > 0) {
      ctx.strokeStyle = layer.stroke.color || '#000000';
      ctx.lineWidth = layer.stroke.width;
      ctx.strokeText(cleanLine, lineX, startY + idx * lineHeight);
    }
  });

  ctx.restore();
}

function resolveCaptionTextAndWordIndex(scene, currentTime, layer) {
  let text = layer.text || '';
  let activeWordIdx = -1;

  if (Array.isArray(scene.syncedSegments) && scene.syncedSegments.length > 0) {
    const activeSeg = scene.syncedSegments.find(s => currentTime >= s.start && currentTime <= s.end);
    if (activeSeg) {
      text = activeSeg.text;
      if (layer.highlightActiveWord && Array.isArray(activeSeg.words)) {
        activeWordIdx = activeSeg.words.findIndex(w => currentTime >= w.start && currentTime <= w.end);
      }
    } else if (currentTime <= scene.syncedSegments[0].start) {
      text = scene.syncedSegments[0].text;
    } else {
      let lastSeg = null;
      for (let i = scene.syncedSegments.length - 1; i >= 0; i--) {
        if (currentTime >= scene.syncedSegments[i].start) { lastSeg = scene.syncedSegments[i]; break; }
      }
      text = lastSeg ? lastSeg.text : scene.syncedSegments[scene.syncedSegments.length - 1].text;
    }
  }
  return { text, activeWordIdx };
}

export function drawTranscriptionLayer(ctx, layer, scene, currentTime) {
  const { text: currentCaptionText, activeWordIdx } = resolveCaptionTextAndWordIndex(scene, currentTime, layer);
  const layout = measureTextLayout(ctx, layer, currentCaptionText);
  const { lines, lineHeight, measuredFontSize } = layout;
  if (!lines || lines.length === 0) return;

  ctx.save();
  ctx.font = `${layer.fontWeight || '700'} ${measuredFontSize}px ${layer.fontFamily || "'Merriweather', serif"}`;
  ctx.fillStyle = layer.fill || '#111827';
  ctx.textBaseline = 'top';

  if (typeof layer.anchorCenterY !== 'number') {
    layer.anchorCenterY = layer.y + (layer.height || 400) / 2;
  }

  let startY = layer.y;
  const vAlign = layer.verticalAlign || 'middle';
  if (vAlign === 'middle') {
    startY = layer.anchorCenterY - (layout.totalHeight / 2);
  } else if (vAlign === 'bottom') {
    startY = (layer.anchorCenterY + (layer.height || 400) / 2) - layout.totalHeight;
  } else {
    startY = layer.anchorCenterY - (layer.height || 400) / 2;
  }

  layer.renderedTop = startY;
  layer.renderedHeight = layout.totalHeight;

  let globalWordCount = 0;
  lines.forEach((lineText, lIdx) => {
    const cleanLine = lineText.replace('\n', '');
    const lineY = startY + lIdx * lineHeight;
    const lineWidth = ctx.measureText(cleanLine).width;

    let lineX = layer.x;
    if (layer.align === 'center') lineX = layer.x + (layer.width - lineWidth) / 2;
    else if (layer.align === 'right') lineX = layer.x + (layer.width - lineWidth);

    if (!layer.highlightActiveWord || activeWordIdx === -1) {
      ctx.fillText(cleanLine, lineX, lineY);
    } else {
      const words = cleanLine.split(' ');
      let curWordX = lineX;
      words.forEach(word => {
        const isCurrent = globalWordCount === activeWordIdx;
        const wordText = word + ' ';
        const wordWidth = ctx.measureText(wordText).width;
        if (isCurrent) {
          ctx.save();
          ctx.fillStyle = layer.activeWordColor || '#0D99FF';
          ctx.fillText(word, curWordX, lineY);
          ctx.restore();
        } else {
          ctx.fillText(word, curWordX, lineY);
        }
        curWordX += wordWidth;
        globalWordCount++;
      });
    }
  });

  ctx.restore();
}
