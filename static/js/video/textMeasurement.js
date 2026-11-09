/**
 * Text Casing and Text Measurement Engine.
 * Single source of truth for text measurement & line wrapping across preview and export.
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

let fontGeneration = 0;
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener?.('loadingdone', () => { fontGeneration++; });
}

export function measureTextLayout(ctx, layer, overrideText = null) {
  const rawText = overrideText !== null ? overrideText : (layer.text || '');
  const text = formatTextCasing(rawText, layer.casing);
  
  const key = JSON.stringify([fontGeneration, text, layer.fontSize, layer.fontFamily, layer.fontWeight,
    layer.lineHeight, layer.resizing, layer.width, layer.height, layer.autoShrink]);
  if (layer._exportLayoutKey === key && layer.layoutCache) return layer.layoutCache;

  let targetFontSize = layer.fontSize || 48;
  const fontFamily = layer.fontFamily || "'Merriweather', serif";
  const fontWeight = layer.fontWeight || '700';
  const lineHeightRatio = layer.lineHeight || 1.35;
  const isAutoWidth = layer.resizing === 'auto_width';
  const isFixed = layer.resizing === 'fixed';
  
  const maxAllowedWidth = isAutoWidth ? 99999 : Math.max(30, layer.width);
  const maxAllowedHeight = isFixed ? Math.max(20, layer.height) : 99999;

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

      if (pIdx < paragraphs.length - 1 && lines.length > 0) {
        lines[lines.length - 1] += '\n';
      }
    });

    totalHeight = lines.length * actualLineHeight;
    ctx.restore();
    return totalHeight;
  };

  performWrap(targetFontSize);

  if (isFixed && layer.autoShrink && totalHeight > maxAllowedHeight && targetFontSize > 16) {
    while (totalHeight > maxAllowedHeight && targetFontSize > 14) {
      targetFontSize -= 2;
      performWrap(targetFontSize);
    }
  }

  layer.layoutCache = {
    text,
    lines,
    totalHeight,
    lineWidths,
    maxLineWidth,
    measuredFontSize: targetFontSize,
    lineHeight: actualLineHeight
  };

  if (layer.resizing === 'auto_height') {
    layer.height = Math.max(20, Math.ceil(totalHeight));
  } else if (layer.resizing === 'auto_width') {
    layer.width = Math.max(30, Math.ceil(maxLineWidth));
    layer.height = Math.max(20, Math.ceil(totalHeight));
  }

  if (layer._exportMemoizeLayout) {
    layer._exportLayoutKey = JSON.stringify([fontGeneration, text, layer.fontSize, layer.fontFamily, layer.fontWeight,
      layer.lineHeight, layer.resizing, layer.width, layer.height, layer.autoShrink]);
  }
  return layer.layoutCache;
}
