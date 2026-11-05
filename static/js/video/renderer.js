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
    // Core layers stay active across the entire video
    if (layer.type === 'transcription' || layer.type === 'audio_widget' || layer.id === 'layer_captions' || layer.id === 'layer_player_widget') {
      return true;
    }
    const start = typeof layer.startTime === 'number' ? layer.startTime : 0;
    const end = typeof layer.endTime === 'number' ? layer.endTime : 999999;
    return currentTime >= start && currentTime <= end;
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
      // In pauses between segments or trailing audio, display the most recent segment so text never flickers off
      if (currentTime <= scene.syncedSegments[0].start) {
        currentCaptionText = scene.syncedSegments[0].text;
      } else {
        let lastPastSeg = null;
        for (let i = scene.syncedSegments.length - 1; i >= 0; i--) {
          if (currentTime >= scene.syncedSegments[i].start) {
            lastPastSeg = scene.syncedSegments[i];
            break;
          }
        }
        currentCaptionText = lastPastSeg ? lastPastSeg.text : scene.syncedSegments[scene.syncedSegments.length - 1].text;
      }
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

  if (typeof layer.anchorCenterY !== 'number') {
    layer.anchorCenterY = layer.y + (layer.height || 400) / 2;
  }

  let startY = layer.y;
  const vAlign = layer.verticalAlign || 'middle';
  if (vAlign === 'middle') {
    // Symmetrical growth in both directions: center stays pinned
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
    // Start loading once; don't spawn a new request on every frame
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
 * Aesthetic Audio Player Bar Widget Overlay with Multiple Templates
 */
function drawAudioWidgetLayer(ctx, layer, scene, currentTime) {
  const duration = scene.duration || 10;
  const progress = Math.min(1, Math.max(0, currentTime / duration));

  const color = layer.color || '#111827';
  const style = layer.widgetStyle || 'classic';

  ctx.save();

  switch (style) {
    case 'waveform':
      drawWaveformWidget(ctx, layer, progress, color, currentTime, duration);
      break;
    case 'capsule':
      drawCapsuleWidget(ctx, layer, progress, color, currentTime, duration);
      break;
    case 'glow_line':
      drawGlowLineWidget(ctx, layer, progress, color);
      break;
    case 'minimal_dots':
      drawMinimalDotsWidget(ctx, layer, progress, color);
      break;
    case 'equalizer':
      drawEqualizerWidget(ctx, layer, progress, color, currentTime, duration);
      break;
    case 'gradient_pill':
      drawGradientPillWidget(ctx, layer, progress, color, currentTime, duration);
      break;
    case 'classic':
    default:
      drawClassicLineWidget(ctx, layer, progress, color);
      break;
  }

  ctx.restore();
}

function drawClassicLineWidget(ctx, layer, progress, color) {
  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const barY = startY + 12;
  const thickness = layer.thickness || 2.5;

  // Background track (subtle stroke)
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, barY);
  ctx.lineTo(startX + trackW, barY);
  ctx.stroke();

  // Played track (accented solid)
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  ctx.moveTo(startX, barY);
  ctx.lineTo(startX + (trackW * progress), barY);
  ctx.stroke();

  // Scrubber ball at current progress
  const ballX = startX + (trackW * progress);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ballX, barY, layer.playheadRadius || 7, 0, Math.PI * 2);
  ctx.fill();

  if (layer.showControls) {
    drawWidgetTransportIcons(ctx, startX + trackW / 2, barY + 36, color);
  }
}

function drawWaveformWidget(ctx, layer, progress, color, currentTime, duration) {
  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const barCount = 42;
  const barW = (trackW / barCount) * 0.65;
  const gap = (trackW / barCount) * 0.35;
  const centerY = startY + 28;

  for (let i = 0; i < barCount; i++) {
    const frac = i / (barCount - 1);
    // Deterministic organic wave envelope
    const rawH = 8 + Math.abs(Math.sin(i * 0.45) * 22 + Math.cos(i * 0.9) * 14);
    const h = Math.max(6, Math.min(46, rawH));
    const bx = startX + i * (barW + gap);
    const by = centerY - h / 2;

    const isPlayed = frac <= progress;
    ctx.fillStyle = color;
    ctx.globalAlpha = isPlayed ? 1.0 : 0.28;

    drawRoundedRectPath(ctx, bx, by, barW, h, barW / 2);
    ctx.fill();
  }

  // Transport under waveform
  if (layer.showControls) {
    drawWidgetTransportIcons(ctx, startX + trackW / 2, centerY + 36, color);
  }
}

function drawCapsuleWidget(ctx, layer, progress, color, currentTime, duration) {
  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const capsuleH = 54;
  const radius = capsuleH / 2;

  // Dark frosted pill container
  ctx.fillStyle = 'rgba(24, 24, 27, 0.88)';
  drawRoundedRectPath(ctx, startX, startY, trackW, capsuleH, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Play icon circle on left
  const playCx = startX + 28;
  const playCy = startY + radius;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(playCx, playCy, 14, 0, Math.PI * 2);
  ctx.fill();

  // Play triangle inside circle
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(playCx - 3, playCy - 6);
  ctx.lineTo(playCx + 5, playCy);
  ctx.lineTo(playCx - 3, playCy + 6);
  ctx.closePath();
  ctx.fill();

  // Middle scrub track
  const barX = startX + 54;
  const barY = startY + radius;
  const barW = Math.max(50, trackW - 170);

  // Background line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW, barY);
  ctx.stroke();

  // Progress line
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + (barW * progress), barY);
  ctx.stroke();

  // Head dot
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(barX + (barW * progress), barY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Timecode on right
  const timeStr = `${formatWidgetTime(currentTime)} / ${formatWidgetTime(duration)}`;
  ctx.fillStyle = '#F3F4F6';
  ctx.font = "600 12px 'Inter', monospace";
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeStr, startX + trackW - 18, startY + radius);
}

function drawGlowLineWidget(ctx, layer, progress, color) {
  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const barY = startY + 14;

  // Background track
  ctx.strokeStyle = 'rgba(150, 150, 150, 0.25)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, barY);
  ctx.lineTo(startX + trackW, barY);
  ctx.stroke();

  // Glowing played track
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(startX, barY);
  ctx.lineTo(startX + (trackW * progress), barY);
  ctx.stroke();

  // Glowing playhead ring
  const ballX = startX + (trackW * progress);
  ctx.fillStyle = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(ballX, barY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (layer.showControls) {
    drawWidgetTransportIcons(ctx, startX + trackW / 2, barY + 36, color);
  }
}

function drawMinimalDotsWidget(ctx, layer, progress, color) {
  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const dotCount = 28;
  const barY = startY + 14;
  const step = trackW / (dotCount - 1);

  for (let i = 0; i < dotCount; i++) {
    const frac = i / (dotCount - 1);
    const cx = startX + i * step;
    const isPlayed = frac <= progress;

    ctx.fillStyle = color;
    ctx.globalAlpha = isPlayed ? 1.0 : 0.25;
    ctx.beginPath();
    ctx.arc(cx, barY, isPlayed ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (layer.showControls) {
    drawWidgetTransportIcons(ctx, startX + trackW / 2, barY + 36, color);
  }
}

function drawEqualizerWidget(ctx, layer, progress, color, currentTime, duration) {
  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const barCount = 36;
  const barW = (trackW / barCount) * 0.65;
  const gap = (trackW / barCount) * 0.35;
  const baseY = startY + 44;

  for (let i = 0; i < barCount; i++) {
    const frac = i / (barCount - 1);
    const isPlayed = frac <= progress;

    const t = currentTime * 4.2;
    const wave1 = Math.sin(i * 0.45 + t) * 16;
    const wave2 = Math.cos(i * 0.85 - t * 0.8) * 12;
    const wave3 = Math.sin(i * 1.4 + t * 1.5) * 6;
    const rawH = 8 + Math.abs(wave1 + wave2 + wave3);
    const h = Math.max(6, Math.min(50, rawH));

    const bx = startX + i * (barW + gap);
    const by = baseY - h;

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = isPlayed ? 1.0 : 0.28;

    drawRoundedRectPath(ctx, bx, by, barW, h, barW / 2);
    ctx.fill();

    if (isPlayed) {
      ctx.globalAlpha = 0.85;
      const peakY = by - 6;
      ctx.fillRect(bx, peakY, barW, 2);
    }
    ctx.restore();
  }

  if (layer.showControls) {
    drawWidgetTransportIcons(ctx, startX + trackW / 2, baseY + 32, color);
  }
}

function drawGradientPillWidget(ctx, layer, progress, color, currentTime, duration) {
  const startX = layer.x;
  const startY = layer.y;
  const trackW = layer.width;
  const pillH = 46;
  const radius = pillH / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(18, 18, 22, 0.72)';
  drawRoundedRectPath(ctx, startX, startY, trackW, pillH, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Mini Play Icon
  const playCx = startX + 24;
  const playCy = startY + radius;
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

  // Progress Bar
  const barX = startX + 48;
  const barY = startY + radius;
  const barW = Math.max(40, trackW - 165);

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
    ctx.shadowBlur = 0;
  }

  const timeStr = `${formatWidgetTime(currentTime)} / ${formatWidgetTime(duration)}`;
  ctx.fillStyle = '#E5E7EB';
  ctx.font = "600 11.5px 'Inter', monospace";
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeStr, startX + trackW - 16, startY + radius);

  ctx.restore();
}

function drawWidgetTransportIcons(ctx, centerX, controlsY, color) {
  ctx.save();
  ctx.globalAlpha = 1.0;
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
  ctx.restore();
}

function formatWidgetTime(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
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
