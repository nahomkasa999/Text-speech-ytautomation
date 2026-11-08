/**
 * Audio player widget: smooth wave animations (see ambientWidgets.js).
 *
 * By default the waves move on their own. With "Move with the voice"
 * (layer.syncToVoice) their size follows the narration's loudness.
 */

import { drawAmbientWidget, isAmbientStyle } from './ambientWidgets.js';
import { voiceLevelAt } from '../modules/studio/playback/voiceEnvelope.js';

export function drawAudioWidgetLayer(ctx, layer, scene, currentTime) {
  const style = isAmbientStyle(layer.widgetStyle) ? layer.widgetStyle : 'ambient_flow';
  // While the editor is paused, scene.ambientClock keeps the motion going; on
  // playback/export the video time drives it so the result is deterministic.
  const t = typeof scene.ambientClock === 'number' ? scene.ambientClock : currentTime;
  // Loudness at the audio time; a small floor keeps a gentle ripple in pauses.
  const energy = layer.syncToVoice ? 0.12 + 0.88 * voiceLevelAt(scene.voiceEnvelope, currentTime) : null;
  drawAmbientWidget(ctx, { ...layer, widgetStyle: style }, t, layer.color || '#111827', energy);
}
