/**
 * Text and Synced Transcription Layers
 */

import { Layer } from './baseLayer.js';

export class TextLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'text' });
    this.name = data.name || 'Text';
    this.text = typeof data.text === 'string' ? data.text : 'Heading';
    this.fontFamily = data.fontFamily || "'Merriweather', serif";
    this.fontSize = typeof data.fontSize === 'number' ? data.fontSize : 54;
    this.fontWeight = data.fontWeight || '700';
    this.lineHeight = typeof data.lineHeight === 'number' ? data.lineHeight : 1.35;
    this.letterSpacing = typeof data.letterSpacing === 'number' ? data.letterSpacing : 0;
    this.paragraphSpacing = typeof data.paragraphSpacing === 'number' ? data.paragraphSpacing : 12;
    this.align = data.align || 'left';
    this.verticalAlign = data.verticalAlign || 'top';
    this.casing = data.casing || 'none';
    this.decoration = data.decoration || 'none';
    this.resizing = data.resizing || 'auto_height';
    this.autoShrink = data.autoShrink !== false;
    this.fill = data.fill || '#111827';
    this.anchorCenterY = typeof data.anchorCenterY === 'number' ? data.anchorCenterY : (this.y + (this.height || 400) / 2);
    this.stroke = data.stroke || { color: '#000000', width: 0 };
    this.shadow = data.shadow || { color: 'rgba(0,0,0,0.3)', blur: 0, x: 0, y: 0 };
    
    this.layoutCache = {
      lines: [],
      totalHeight: 0,
      lineWidths: [],
      maxLineWidth: 0,
      measuredFontSize: this.fontSize
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      text: this.text,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      lineHeight: this.lineHeight,
      letterSpacing: this.letterSpacing,
      paragraphSpacing: this.paragraphSpacing,
      align: this.align,
      verticalAlign: this.verticalAlign,
      casing: this.casing,
      decoration: this.decoration,
      resizing: this.resizing,
      autoShrink: this.autoShrink,
      anchorCenterY: this.anchorCenterY,
      fill: this.fill,
      stroke: this.stroke,
      shadow: this.shadow
    };
  }
}

export class TranscriptionLayer extends TextLayer {
  constructor(data = {}) {
    super({ ...data, type: 'transcription' });
    this.type = 'transcription';
    this.endTime = 999999;
    this.name = data.name || 'Synced Captions';
    this.text = data.text || 'let me say that again your emotions are not your friend';
    // Older projects stored the shrink-to-text height; give those a roomy box once.
    // Projects saved with a fixed caption box keep the size the user chose.
    this.captionBoxFixed = true;
    this.height = typeof data.height !== 'number' ? 420
      : (data.captionBoxFixed ? Math.max(data.height, 40) : Math.max(data.height, 400));
    this.verticalAlign = data.verticalAlign || 'middle';
    // Captions use a fixed-size box: the text is paginated to fill it
    // (see captionPagination.js) instead of the box growing/shrinking.
    this.resizing = 'fixed';
    // Keep the box centred where the captions were, now that the height is fixed.
    this.y = this.anchorCenterY - this.height / 2;
    this.maxLines = typeof data.maxLines === 'number' ? data.maxLines : 4;
    this.wordsPerChunk = typeof data.wordsPerChunk === 'number' ? data.wordsPerChunk : 8;
    this.highlightActiveWord = data.highlightActiveWord !== false;
    this.activeWordColor = data.activeWordColor || '#0D99FF';
    this.activeWordScale = typeof data.activeWordScale === 'number' ? data.activeWordScale : 1.0;
    this.animation = data.animation || 'none';
    this.karaokeStyle = !!data.karaokeStyle;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'transcription',
      captionBoxFixed: true,
      verticalAlign: this.verticalAlign,
      maxLines: this.maxLines,
      wordsPerChunk: this.wordsPerChunk,
      highlightActiveWord: this.highlightActiveWord,
      activeWordColor: this.activeWordColor,
      activeWordScale: this.activeWordScale,
      animation: this.animation,
      karaokeStyle: this.karaokeStyle
    };
  }
}
