/**
 * Scene Graph Model for Video Studio
 * Pure JS, fully JSON-serializable, independent layer types
 */

export class Layer {
  constructor(data = {}) {
    this.id = data.id || `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.name = data.name || 'Layer';
    this.type = data.type || 'layer';
    this.visible = data.visible !== false;
    this.locked = !!data.locked;
    
    // Timeline boundaries (in seconds)
    this.startTime = typeof data.startTime === 'number' ? data.startTime : 0;
    this.endTime = typeof data.endTime === 'number' ? data.endTime : 999999;
    
    // Canvas geometry (in canvas pixels e.g. 1920x1080)
    this.x = typeof data.x === 'number' ? data.x : 100;
    this.y = typeof data.y === 'number' ? data.y : 100;
    this.width = typeof data.width === 'number' ? data.width : 400;
    this.height = typeof data.height === 'number' ? data.height : 200;
    this.rotation = typeof data.rotation === 'number' ? data.rotation : 0; // degrees
    this.opacity = typeof data.opacity === 'number' ? data.opacity : 1.0; // 0 to 1
    
    this.parentId = data.parentId || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      locked: this.locked,
      startTime: this.startTime,
      endTime: this.endTime,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      opacity: this.opacity,
      parentId: this.parentId
    };
  }

  clone() {
    return createLayerFromData(this.toJSON());
  }
}

export class FrameLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'frame' });
    this.name = data.name || 'Frame';
    this.children = Array.isArray(data.children) ? [...data.children] : [];
    this.fill = data.fill || 'transparent';
    this.stroke = data.stroke || { color: '#444444', width: 0, position: 'inside' };
    this.cornerRadius = typeof data.cornerRadius === 'number' ? data.cornerRadius : 0;
    this.clipContent = data.clipContent !== false;
    
    // Auto-layout configuration (Figma-style)
    this.autoLayout = {
      enabled: !!data.autoLayout?.enabled,
      flow: data.autoLayout?.flow || 'vertical', // 'vertical' | 'horizontal' | 'wrap'
      gap: typeof data.autoLayout?.gap === 'number' ? data.autoLayout.gap : 16,
      padding: {
        top: data.autoLayout?.padding?.top ?? 16,
        right: data.autoLayout?.padding?.right ?? 16,
        bottom: data.autoLayout?.padding?.bottom ?? 16,
        left: data.autoLayout?.padding?.left ?? 16
      },
      alignment: data.autoLayout?.alignment || 'top-left', // 'top-left', 'center', etc.
      resizing: {
        w: data.autoLayout?.resizing?.w || 'fixed', // 'fixed' | 'hug' | 'fill'
        h: data.autoLayout?.resizing?.h || 'fixed'
      }
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      children: this.children,
      fill: this.fill,
      stroke: this.stroke,
      cornerRadius: this.cornerRadius,
      clipContent: this.clipContent,
      autoLayout: this.autoLayout
    };
  }
}

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
    this.align = data.align || 'left'; // 'left' | 'center' | 'right' | 'justify'
    this.verticalAlign = data.verticalAlign || 'top'; // 'top' | 'middle' | 'bottom'
    this.casing = data.casing || 'none'; // 'none' | 'upper' | 'lower' | 'title'
    this.decoration = data.decoration || 'none'; // 'none' | 'underline' | 'strikethrough'
    
    // Resizing behavior: 'auto_height' (width fixed, height hugs text), 'auto_width', 'fixed'
    this.resizing = data.resizing || 'auto_height';
    this.autoShrink = data.autoShrink !== false;
    
    this.fill = data.fill || '#111827';
    this.stroke = data.stroke || { color: '#000000', width: 0 };
    this.shadow = data.shadow || { color: 'rgba(0,0,0,0.3)', blur: 0, x: 0, y: 0 };
    
    // Layout measurement cache (reused identically by renderer and selection box)
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
    this.height = typeof data.height === 'number' ? Math.max(data.height, 400) : 420;
    this.verticalAlign = data.verticalAlign || 'middle';
    this.maxLines = typeof data.maxLines === 'number' ? data.maxLines : 4;
    this.wordsPerChunk = typeof data.wordsPerChunk === 'number' ? data.wordsPerChunk : 8;
    this.highlightActiveWord = data.highlightActiveWord !== false;
    this.activeWordColor = data.activeWordColor || '#0D99FF';
    this.activeWordScale = typeof data.activeWordScale === 'number' ? data.activeWordScale : 1.0;
    this.animation = data.animation || 'none'; // 'none' | 'fade' | 'pop' | 'slide'
    this.karaokeStyle = !!data.karaokeStyle;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'transcription',
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

export class ImageLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'image' });
    this.name = data.name || 'Image';
    this.src = data.src || '';
    this.fit = data.fit || 'fill'; // 'fill' | 'fit' | 'crop'
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
    this.widgetStyle = data.widgetStyle || 'classic'; // 'classic' | 'waveform' | 'capsule' | 'glow_line' | 'minimal_dots'
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

export function createLayerFromData(data = {}) {
  if (!data) return null;
  const cleanData = { ...data };
  if (cleanData.endTime === 10 || cleanData.endTime === undefined) {
    cleanData.endTime = 999999;
  }
  if (cleanData.id === 'layer_captions') return new TranscriptionLayer(cleanData);
  if (cleanData.id === 'layer_player_widget') return new AudioWidgetLayer(cleanData);
  switch (cleanData.type) {
    case 'frame': return new FrameLayer(cleanData);
    case 'transcription': return new TranscriptionLayer(cleanData);
    case 'text': return new TextLayer(cleanData);
    case 'image': return new ImageLayer(cleanData);
    case 'shape': return new ShapeLayer(cleanData);
    case 'audio_widget': return new AudioWidgetLayer(cleanData);
    default: return new Layer(cleanData);
  }
}

export class Scene {
  constructor(data = {}) {
    this.canvas = {
      width: data.canvas?.width || 1920,
      height: data.canvas?.height || 1080,
      preset: data.canvas?.preset || '16:9',
      background: data.canvas?.background || '#C85A32'
    };
    
    this.duration = typeof data.duration === 'number' ? data.duration : 10;
    this.currentTime = typeof data.currentTime === 'number' ? data.currentTime : 0;
    this.audioSpeed = typeof data.audioSpeed === 'number' ? data.audioSpeed : 1.0;
    this.audioVolume = typeof data.audioVolume === 'number' ? data.audioVolume : 1.0;
    
    // Captions sync timings from TTS
    this.syncedSegments = Array.isArray(data.syncedSegments) ? [...data.syncedSegments] : [];
    
    // Layers array
    this.layers = [];
    if (Array.isArray(data.layers)) {
      this.layers = data.layers.map(createLayerFromData);
    }

    this.selectedLayerIds = Array.isArray(data.selectedLayerIds) ? [...data.selectedLayerIds] : [];
  }

  addLayer(layer, index = null) {
    if (!layer) return null;
    // Prevent duplicate layers with identical ID
    this.layers = this.layers.filter(l => l.id !== layer.id);
    if (index === null || index >= this.layers.length) {
      this.layers.push(layer);
    } else {
      this.layers.splice(Math.max(0, index), 0, layer);
    }
    return layer;
  }

  removeLayer(layerId) {
    const initialLen = this.layers.length;
    this.layers = this.layers.filter(l => l.id !== layerId);
    this.selectedLayerIds = this.selectedLayerIds.filter(id => id !== layerId);
    return this.layers.length < initialLen;
  }

  getLayer(layerId) {
    return this.layers.find(l => l.id === layerId) || null;
  }

  getSelectedLayer() {
    if (this.selectedLayerIds.length === 0) return null;
    return this.getLayer(this.selectedLayerIds[this.selectedLayerIds.length - 1]);
  }

  selectLayer(layerId, additive = false) {
    if (!layerId) {
      this.selectedLayerIds = [];
      return;
    }
    if (additive) {
      if (!this.selectedLayerIds.includes(layerId)) {
        this.selectedLayerIds.push(layerId);
      }
    } else {
      this.selectedLayerIds = [layerId];
    }
  }

  reorderLayer(layerId, newIndex) {
    const oldIndex = this.layers.findIndex(l => l.id === layerId);
    if (oldIndex === -1) return;
    const [layer] = this.layers.splice(oldIndex, 1);
    const targetIdx = Math.max(0, Math.min(this.layers.length, newIndex));
    this.layers.splice(targetIdx, 0, layer);
  }

  bringToFront(layerId) {
    this.reorderLayer(layerId, this.layers.length);
  }

  sendToBack(layerId) {
    this.reorderLayer(layerId, 0);
  }

  bringForward(layerId) {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx < this.layers.length - 1) this.reorderLayer(layerId, idx + 1);
  }

  sendBackward(layerId) {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx > 0) this.reorderLayer(layerId, idx - 1);
  }

  toJSON() {
    return {
      canvas: this.canvas,
      duration: this.duration,
      currentTime: this.currentTime,
      audioSpeed: this.audioSpeed,
      audioVolume: this.audioVolume,
      syncedSegments: this.syncedSegments,
      selectedLayerIds: this.selectedLayerIds,
      layers: this.layers.map(l => l.toJSON())
    };
  }

  fromJSON(json) {
    this.canvas = json.canvas || this.canvas;
    this.duration = json.duration || this.duration;
    this.currentTime = json.currentTime || 0;
    this.audioSpeed = json.audioSpeed || 1.0;
    this.audioVolume = json.audioVolume || 1.0;
    this.syncedSegments = Array.isArray(json.syncedSegments) ? json.syncedSegments : [];
    this.selectedLayerIds = Array.isArray(json.selectedLayerIds) ? json.selectedLayerIds : [];
    this.layers = Array.isArray(json.layers) ? json.layers.map(createLayerFromData) : [];
  }

  clone() {
    return new Scene(JSON.parse(JSON.stringify(this.toJSON())));
  }
}
