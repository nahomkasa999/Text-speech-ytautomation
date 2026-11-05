/**
 * Studio State and Initial Layer Configuration.
 */

import { TranscriptionLayer, AudioWidgetLayer } from '../../video/scene.js';

export function createInitialLayers() {
  const defaultCaptionLayer = new TranscriptionLayer({
    id: 'layer_captions',
    name: 'Synced Captions',
    x: 880,
    y: 240,
    width: 920,
    fontSize: 54,
    fill: '#111827',
    align: 'left'
  });

  const defaultAudioWidget = new AudioWidgetLayer({
    id: 'layer_player_widget',
    name: 'Audio Player Bar',
    x: 840,
    y: 720,
    width: 940,
    color: '#111827',
    thickness: 2.5,
    playheadRadius: 7
  });

  return [defaultCaptionLayer, defaultAudioWidget];
}

export function createInitialState() {
  return {
    engine: 'local',
    voices: { local: [], deployed: [], cloud_api: [] },
    selectedVoice: 'am_adam',
    speed: 1.0,
    paragraphPause: 0.6,
    sentencePause: 0.25,
    sessions: [],
    activeSession: null,
    isGenerating: false,

    video: {
      bgImage: null,
      bgImageUrl: null,
      bgImageLoaded: false,
      audioSpeed: 1.0,
      audioVolume: 1.0,
      preservePitch: true,
      isMuted: false,
      lastVolume: 1.0,
      isPlaying: false,
      isExporting: false,
      selectedLayerId: 'layer_captions',
      syncedSegments: []
    }
  };
}
