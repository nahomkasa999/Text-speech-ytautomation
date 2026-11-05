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

export class AudioWidgetLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'audio_widget' });
    this.type = 'audio_widget';
    this.endTime = 999999;
    this.name = data.name || 'Audio Player Bar';
    this.widgetStyle = data.widgetStyle || 'classic';
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
      color: this.color,
      thickness: this.thickness,
      showControls: this.showControls,
      playheadRadius: this.playheadRadius
    };
  }
}
