/**
 * Scene Graph Model for Video Studio
 * Pure JS, fully JSON-serializable, independent layer types
 */

import { Layer } from './layers/baseLayer.js';
import { FrameLayer } from './layers/frameLayer.js';
import { TextLayer, TranscriptionLayer } from './layers/textLayers.js';
import { ImageLayer, ShapeLayer, AudioWidgetLayer } from './layers/mediaLayers.js';
import { createLayerFromData } from './layers/layerFactory.js';

export {
  Layer,
  FrameLayer,
  TextLayer,
  TranscriptionLayer,
  ImageLayer,
  ShapeLayer,
  AudioWidgetLayer,
  createLayerFromData
};

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
    this.syncedSegments = Array.isArray(data.syncedSegments) ? [...data.syncedSegments] : [];
    
    this.layers = [];
    if (Array.isArray(data.layers)) {
      this.layers = data.layers.map(createLayerFromData);
    }

    this.selectedLayerIds = Array.isArray(data.selectedLayerIds) ? [...data.selectedLayerIds] : [];
  }

  addLayer(layer, index = null) {
    if (!layer) return null;
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
