/**
 * Factory for creating concrete Layer instances from serialized JSON data.
 */

import { Layer } from './baseLayer.js';
import { FrameLayer } from './frameLayer.js';
import { TextLayer, TranscriptionLayer } from './textLayers.js';
import { ImageLayer, ShapeLayer, AudioWidgetLayer } from './mediaLayers.js';

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
