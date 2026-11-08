/**
 * Image, Shape, and Audio Widget Layers
 */

import { Layer } from './baseLayer.js';

export class ImageLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'image' });
    this.name = data.name || 'Image';
    this.src = data.src || '';
    this.fit = data.fit || 'fill';
    this.cornerRadius = typeof data.cornerRadius === 'number' ? data.cornerRadius : 0;
    this._loadedImage = null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      src: this.src,
      fit: this.fit,
      cornerRadius: this.cornerRadius
    };
  }
}

export class ShapeLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'shape' });
    this.name = data.name || 'Shape';
    this.shapeType = data.shapeType || 'rectangle'; // 'rectangle' | 'ellipse' | 'line'
    this.fill = data.fill || '#0D99FF';
    this.stroke = data.stroke || { color: '#FFFFFF', width: 0 };
    this.cornerRadius = typeof data.cornerRadius === 'number' ? data.cornerRadius : 0;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      shapeType: this.shapeType,
      fill: this.fill,
      stroke: this.stroke,
      cornerRadius: this.cornerRadius
    };
  }
}

// The old progress-bar styles were removed; projects that used one get the
// closest always-moving animation instead.
const LEGACY_WIDGET_STYLES = {
  classic: 'ambient_flow',
  capsule: 'ambient_flow',
  gradient_pill: 'ambient_flow',
  waveform: 'ambient_pulse',
  equalizer: 'ambient_pulse',
  minimal_dots: 'ambient_dots',
  glow_line: 'ambient_glow',
};

export class AudioWidgetLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'audio_widget' });
    this.type = 'audio_widget';
    this.endTime = 999999;
    this.name = data.name || 'Audio Player Bar';
    const legacy = !data.widgetStyle || LEGACY_WIDGET_STYLES[data.widgetStyle];
    this.widgetStyle = LEGACY_WIDGET_STYLES[data.widgetStyle] || data.widgetStyle || 'ambient_flow';
    // Wave animations draw in a band of the layer height; 100px looks calm.
    if (legacy && (typeof data.height !== 'number' || data.height >= 200)) this.height = 100;
    // "Move with the voice": waves follow the narration loudness when true.
    this.syncToVoice = !!data.syncToVoice;
    // Colours: one main colour (this.color); the 2-3 layer colours are matched
    // automatically unless autoPalette is false, then palette[i] is used.
    this.autoPalette = data.autoPalette !== false;
    this.palette = Array.isArray(data.palette) ? data.palette.slice(0, 5) : [];
    this.glow = typeof data.glow === 'number' ? data.glow : 0;
    // Width at 100% on the Size slider (kept so scaling back down restores the shape).
    this.baseWidth = typeof data.baseWidth === 'number' ? data.baseWidth : undefined;
    this.color = data.color || '#111827';
    this.thickness = typeof data.thickness === 'number' ? data.thickness : 4;
    this.showControls = data.showControls !== false;
    this.playheadRadius = typeof data.playheadRadius === 'number' ? data.playheadRadius : 12;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'audio_widget',
      widgetStyle: this.widgetStyle,
      syncToVoice: this.syncToVoice,
      autoPalette: this.autoPalette,
      palette: this.palette,
      glow: this.glow,
      baseWidth: this.baseWidth,
      color: this.color,
      thickness: this.thickness,
      showControls: this.showControls,
      playheadRadius: this.playheadRadius
    };
  }
}
