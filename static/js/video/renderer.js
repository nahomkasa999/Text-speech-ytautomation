/**
 * Unified 60fps Canvas Renderer for Video Studio
 * SHARED IDENTICALLY BY PREVIEW AND MP4 EXPORT.
 * Text layout is measured once and cached so the bounding box and rendered text always match.
 */

/**
 * Text Casing Helper
 */
export function formatTextCasing(str, casing = 'none') {
  if (!str) return '';
  switch (casing) {
    case 'upper': return str.toUpperCase();
    case 'lower': return str.toLowerCase();
    case 'title':
      return str.replace(/\b\w/g, c => c.toUpperCase());
    default:
      return str;
  }
}

/**
 * Single source of truth for text measurement & line wrapping.
 * Updates layer.layoutCache and adjusts layer.height or layer.width for auto resizing.
 */
export function measureTextLayout(ctx, layer, overrideText = null) {
  const rawText = overrideText !== null ? overrideText : (layer.text || '');
  const text = formatTextCasing(rawText, layer.casing);
  
  let targetFontSize = layer.fontSize || 48;
  const fontFamily = layer.fontFamily || "'Merriweather', serif";
  const fontWeight = layer.fontWeight || '700';
  const lineHeightRatio = layer.lineHeight || 1.35;
  const paragraphSpacing = layer.paragraphSpacing || 12;
  const isAutoWidth = layer.resizing === 'auto_width';
  const isFixed = layer.resizing === 'fixed';
  
  const maxAllowedWidth = isAutoWidth ? 99999 : Math.max(30, layer.width);
  const maxAllowedHeight = isFixed ? Math.max(20, layer.height) : 99999;

  // If fixed size with auto-shrink, loop down font size if text overflows height
  let lines = [];
  let totalHeight = 0;
  let lineWidths = [];
  let maxLineWidth = 0;
  let actualLineHeight = targetFontSize * lineHeightRatio;

  const performWrap = (fontSize) => {
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    actualLineHeight = fontSize * lineHeightRatio;
    
    lines = [];
    lineWidths = [];
    maxLineWidth = 0;

    const paragraphs = text.split('\n');
    paragraphs.forEach((para, pIdx) => {
      const words = para.split(' ');
      let curLine = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = curLine ? `${curLine} ${words[n]}` : words[n];
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxAllowedWidth && curLine) {
          lines.push(curLine);
          const w = ctx.measureText(curLine).width;
          lineWidths.push(w);
          if (w > maxLineWidth) maxLineWidth = w;
          curLine = words[n];
        } else {
          curLine = testLine;
        }
      }
      if (curLine) {
        lines.push(curLine);
        const w = ctx.measureText(curLine).width;
        lineWidths.push(w);
        if (w > maxLineWidth) maxLineWidth = w;
      }

      // Add paragraph spacing if not the last paragraph
      if (pIdx < paragraphs.length - 1 && lines.length > 0) {
        lines[lines.length - 1] += '\n';
      }
    });

    totalHeight = lines.length * actualLineHeight;
    ctx.restore();
    return totalHeight;
  };

  performWrap(targetFontSize);

  // Auto-shrink if fixed box
  if (isFixed && layer.autoShrink && totalHeight > maxAllowedHeight && targetFontSize > 16) {
    while (totalHeight > maxAllowedHeight && targetFontSize > 14) {
      targetFontSize -= 2;
      performWrap(targetFontSize);
    }
  }

  // Update layer layoutCache
  layer.layoutCache = {
    text,
    lines,
    totalHeight,
    lineWidths,
    maxLineWidth,
    measuredFontSize: targetFontSize,
    lineHeight: actualLineHeight
  };

  // Sync dimensions according to Figma resizing modes
  if (layer.resizing === 'auto_height') {
    layer.height = Math.max(20, Math.ceil(totalHeight));
  } else if (layer.resizing === 'auto_width') {
    layer.width = Math.max(30, Math.ceil(maxLineWidth));
    layer.height = Math.max(20, Math.ceil(totalHeight));
  }

  return layer.layoutCache;
}

/**
 * Master Scene Render Function
 * Used identically for live viewport preview and MP4 video export.
 */
export function renderScene(ctx, scene, options = {}) {
  const {
    currentTime = scene.currentTime || 0,
    isExport = false,
    bgImage = null,
    scale = 1.0
  } = options;

  const canvasW = scene.canvas.width || 1920;
  const canvasH = scene.canvas.height || 1080;

  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);

  // 1. Draw Canvas Background (Color or Mockup Image)
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, canvasW, canvasH);
  } else if (scene.canvas.background) {
    ctx.fillStyle = scene.canvas.background;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 2. Filter layers visible at currentTime
  const activeLayers = scene.layers.filter(layer => {
    if (!layer.visible) return false;
    // Layer must be within timeline range
    return currentTime >= layer.startTime && currentTime <= layer.endTime;
  });

  // 3. Render Layers in Order
  activeLayers.forEach(layer => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));

    // Handle Transform: translation, rotation around center
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;

    if (layer.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    switch (layer.type) {
      case 'frame':
        drawFrameLayer(ctx, layer, scene, currentTime, options);
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

/**
 * Draw Frame Layer (Figma Container with Auto-Layout or Absolute Children)
 */
function drawFrameLayer(ctx, layer, scene, currentTime, options) {
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

  if (clipContent) {
    ctx.clip();
  }

  // Draw frame children
  if (Array.isArray(layer.children) && layer.children.length > 0) {
    layer.children.forEach(childId => {
      const child = scene.getLayer(childId);
      if (child && child.visible && currentTime >= child.startTime && currentTime <= child.endTime) {
        ctx.save();
        ctx.translate(x, y);
        // Render child element relative to frame origin
        if (child.type === 'text') drawTextLayer(ctx, child);
        else if (child.type === 'shape') drawShapeLayer(ctx, child);
        ctx.restore();
      }
    });
  }

  ctx.restore();
}

/**
 * Draw Independent Text Layer
 */
function drawTextLayer(ctx, layer) {
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

  let startY = layer.y;
  if (layer.verticalAlign === 'middle') {
    startY = layer.y + (layer.height - layout.totalHeight) / 2;
  } else if (layer.verticalAlign === 'bottom') {
    startY = layer.y + (layer.height - layout.totalHeight);
  }

  lines.forEach((lineText, idx) => {
    const cleanLine = lineText.replace('\n', '');
    const lineWidth = ctx.measureText(cleanLine).width;
    let lineX = layer.x;

    if (layer.align === 'center') {
      lineX = layer.x + (layer.width - lineWidth) / 2;
    } else if (layer.align === 'right') {
      lineX = layer.x + (layer.width - lineWidth);
    }

    ctx.fillText(cleanLine, lineX, startY + idx * lineHeight);

    // Optional Stroke / Outline
    if (layer.stroke && layer.stroke.width > 0) {
      ctx.strokeStyle = layer.stroke.color || '#000000';
      ctx.lineWidth = layer.stroke.width;
      ctx.strokeText(cleanLine, lineX, startY + idx * lineHeight);
    }
  });

  ctx.restore();
}

/**
 * Draw Transcription (Synced Captions) Layer
 */
function drawTranscriptionLayer(ctx, layer, scene, currentTime) {
  // 1. Determine active caption chunk from syncedSegments
  let currentCaptionText = layer.text || '';
  let activeWordIndex = -1;

  if (Array.isArray(scene.syncedSegments) && scene.syncedSegments.length > 0) {
    const activeSeg = scene.syncedSegments.find(s => currentTime >= s.start && currentTime <= s.end);
    if (activeSeg) {
      currentCaptionText = activeSeg.text;
      // Word timing estimation inside segment if available
      if (layer.highlightActiveWord && activeSeg.words && Array.isArray(activeSeg.words)) {
        activeWordIndex = activeSeg.words.findIndex(w => currentTime >= w.start && currentTime <= w.end);
      }
    } else {
      // If before first segment or after last, show first or empty
      const first = scene.syncedSegments[0];
      if (first && currentTime < first.start) currentCaptionText = first.text;
    }
  }

  // 2. Measure text with the active caption string
  const layout = measureTextLayout(ctx, layer, currentCaptionText);
  const { lines, lineHeight, measuredFontSize } = layout;
  if (!lines || lines.length === 0) return;

  ctx.save();
  ctx.font = `${layer.fontWeight || '700'} ${measuredFontSize}px ${layer.fontFamily || "'Merriweather', serif"}`;
  ctx.fillStyle = layer.fill || '#111827';
  ctx.textBaseline = 'top';

  let startY = layer.y;
  if (layer.verticalAlign === 'middle') {
    startY = layer.y + (layer.height - layout.totalHeight) / 2;
  } else if (layer.verticalAlign === 'bottom') {
    startY = layer.y + (layer.height - layout.totalHeight);
  }

  let globalWordCount = 0;

  lines.forEach((lineText, lIdx) => {
    const cleanLine = lineText.replace('\n', '');
    const lineY = startY + lIdx * lineHeight;
    const lineWidth = ctx.measureText(cleanLine).width;

    let lineX = layer.x;
    if (layer.align === 'center') {
      lineX = layer.x + (layer.width - lineWidth) / 2;
    } else if (layer.align === 'right') {
      lineX = layer.x + (layer.width - lineWidth);
    }

    if (!layer.highlightActiveWord || activeWordIndex === -1) {
      ctx.fillText(cleanLine, lineX, lineY);
    } else {
      // Render word-by-word to highlight active word
      const words = cleanLine.split(' ');
      let curWordX = lineX;

      words.forEach(word => {
        const isCurrent = globalWordCount === activeWordIndex;
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

/**
 * Draw Image Layer
 */
function drawImageLayer(ctx, layer) {
  if (!layer._loadedImage && layer.src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = layer.src;
    img.onload = () => { layer._loadedImage = img; };
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

/**
 * Draw Shape Layer (Rect, Ellipse, Line)
 */
function drawShapeLayer(ctx, layer) {
  ctx.save();
  ctx.fillStyle = layer.fill || '#0D99FF';

  if (layer.shapeType === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      layer.x + layer.width / 2,
      layer.y + layer.height / 2,
      layer.width / 2,
      layer.height / 2,
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
    // Rectangle
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

/**
 * Aesthetic Audio Player Bar Widget Overlay
 */
function drawAudioWidgetLayer(ctx, layer, scene, currentTime) {
  const duration = scene.duration || 10;
  const progress = Math.min(1, Math.max(0, currentTime / duration));

  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const barY = startY + 12;
  const color = layer.color || '#111827';
  const thickness = layer.thickness || 2.5;

  ctx.save();

  // Background track (subtle / thin line)
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, barY);
  ctx.lineTo(startX + trackW, barY);
  ctx.stroke();

  // Scrubber ball at current progress (refined radius)
  const ballX = startX + (trackW * progress);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ballX, barY, layer.playheadRadius || 7, 0, Math.PI * 2);
  ctx.fill();

  // Sleek transport control icons underneath (thin strokes, never bulky filled shapes)
  if (layer.showControls) {
    const controlsY = barY + 36;
    const centerX = startX + trackW / 2;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Previous Arrow Outline
    ctx.beginPath();
    ctx.moveTo(centerX - 46, controlsY - 9);
    ctx.lineTo(centerX - 56, controlsY);
    ctx.lineTo(centerX - 46, controlsY + 9);
    ctx.moveTo(centerX - 56, controlsY - 9);
    ctx.lineTo(centerX - 66, controlsY);
    ctx.lineTo(centerX - 56, controlsY + 9);
    ctx.stroke();

    // Sleek Pause Bars
    ctx.beginPath();
    ctx.moveTo(centerX - 5, controlsY - 9);
    ctx.lineTo(centerX - 5, controlsY + 9);
    ctx.moveTo(centerX + 5, controlsY - 9);
    ctx.lineTo(centerX + 5, controlsY + 9);
    ctx.stroke();

    // Next Arrow Outline
    ctx.beginPath();
    ctx.moveTo(centerX + 46, controlsY - 9);
    ctx.lineTo(centerX + 56, controlsY);
    ctx.lineTo(centerX + 46, controlsY + 9);
    ctx.moveTo(centerX + 56, controlsY - 9);
    ctx.lineTo(centerX + 66, controlsY);
    ctx.lineTo(centerX + 56, controlsY + 9);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Utility: Draw Rounded Rectangle Path
 */
function drawRoundedRectPath(ctx, x, y, width, height, radius = 0) {
  ctx.beginPath();
  if (!radius) {
    ctx.rect(x, y, width, height);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
