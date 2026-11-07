/**
 * Draft Persistence Service (Local storage + server outputs/draft.json).
 */

import { fetchDraft, saveDraftApi } from './api.js';
import { createLayerFromData, TranscriptionLayer, AudioWidgetLayer } from '../../video/scene.js';

export class DraftService {
  constructor({ el, state, scene, callbacks }) {
    this.el = el;
    this.state = state;
    this.scene = scene;
    this.callbacks = callbacks;
    this.saveTimer = null;
    this.lastPersistedBgUrl = null;
  }

  getPersistableBgUrl() {
    const cur = this.state.video.bgImageUrl;
    if (cur && !cur.startsWith('data:')) return cur;
    return localStorage.getItem('book_narrator_bg_image') || this.lastPersistedBgUrl || null;
  }

  debouncedSaveDraft() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveDraft(), 400);
  }

  async saveDraft() {
    if (this.el.autosaveStatus) this.el.autosaveStatus.textContent = 'Saving...';
    const draft = {
      title: this.el.projectTitle.value,
      text: this.el.bookText.value,
      engine: this.state.engine,
      voice: this.state.selectedVoice,
      speed: this.state.speed,
      paragraphPause: this.state.paragraphPause,
      sentencePause: this.state.sentencePause,
      videoLayers: this.scene.toJSON().layers,
      audioSpeed: this.state.video.audioSpeed,
      audioVolume: this.state.video.audioVolume,
      bg_image: this.getPersistableBgUrl(),
      updated_at: Date.now()
    };

    try {
      localStorage.setItem('book_narrator_draft_buffer', JSON.stringify(draft));
    } catch (e) {}

    try {
      await saveDraftApi({
        title: draft.title,
        text: draft.text,
        engine: draft.engine,
        voice: draft.voice,
        speed: draft.speed,
        paragraph_pause: draft.paragraphPause,
        sentence_pause: draft.sentencePause,
        audio_speed: draft.audioSpeed,
        audio_volume: draft.audioVolume,
        bg_image: draft.bg_image,
        layers: draft.videoLayers
      });
    } catch (e) {}

    if (this.el.autosaveStatus) {
      setTimeout(() => { this.el.autosaveStatus.textContent = 'Saved'; }, 300);
    }
  }

  async restoreDraft() {
    let draft = null;
    try {
      const localStr = localStorage.getItem('book_narrator_draft_buffer');
      if (localStr) draft = JSON.parse(localStr);
    } catch (e) {}

    if (!draft || (!draft.text && !draft.title)) {
      try {
        const res = await fetchDraft();
        if (res && (res.text || res.title || (res.layers && res.layers.length > 0))) {
          draft = {
            title: res.title,
            text: res.text,
            engine: res.engine,
            voice: res.voice,
            speed: res.speed,
            paragraphPause: res.paragraph_pause,
            sentencePause: res.sentence_pause,
            audioSpeed: res.audio_speed,
            audioVolume: res.audio_volume,
            bg_image: res.bg_image,
            videoLayers: res.layers
          };
        }
      } catch (e) {}
    }

    if (draft && (draft.text || draft.title || (draft.videoLayers && draft.videoLayers.length > 0) || draft.bg_image)) {
      this._applyDraftToUI(draft);
      if (this.el.autosaveStatus) this.el.autosaveStatus.textContent = 'Draft Restored';
    }
  }

  _applyDraftToUI(draft) {
    if (draft.text) this.el.bookText.value = draft.text;
    if (draft.title) this.el.projectTitle.value = draft.title || '';
    if (draft.speed) {
      this.state.speed = draft.speed;
      this.el.speedSlider.value = draft.speed;
      this.el.speedVal.textContent = `${draft.speed.toFixed(2)}x`;
    }
    if (draft.paragraphPause) {
      this.state.paragraphPause = draft.paragraphPause;
      this.el.pauseParaSlider.value = draft.paragraphPause;
      this.el.pauseParaVal.textContent = `${draft.paragraphPause.toFixed(1)}s`;
    }
    if (draft.sentencePause) {
      this.state.sentencePause = draft.sentencePause;
      this.el.pauseSentSlider.value = draft.sentencePause;
      this.el.pauseSentVal.textContent = `${draft.sentencePause.toFixed(2)}s`;
    }
    if (draft.engine) {
      this.state.engine = draft.engine;
      this.el.engineTabs.forEach(t => t.classList.toggle('active', t.dataset.engine === this.state.engine));
      this.el.panelDeployedSettings.classList.toggle('hidden', this.state.engine !== 'deployed');
      this.el.panelCloudSettings.classList.toggle('hidden', this.state.engine !== 'cloud_api');
      this.callbacks.renderVoices?.();
    }
    if (draft.voice) {
      this.state.selectedVoice = draft.voice;
      this.el.voiceSelect.value = draft.voice;
    }
    if (draft.audioSpeed) this.callbacks.setAudioSpeed?.(draft.audioSpeed, false);
    if (draft.audioVolume !== undefined) this.callbacks.setAudioVolume?.(draft.audioVolume, false);

    const bgImg = draft.bg_image || localStorage.getItem('book_narrator_bg_image');
    if (bgImg && !bgImg.startsWith('data:')) this.lastPersistedBgUrl = bgImg;
    if (bgImg) this.callbacks.loadBackgroundTemplate?.(bgImg, false);

    if (draft.videoLayers && Array.isArray(draft.videoLayers) && draft.videoLayers.length > 0) {
      this._restoreLayers(draft.videoLayers);
    }
    this.callbacks.updateStats?.();
  }

  _restoreLayers(videoLayers) {
    this.scene.layers = [];
    const seenIds = new Set();
    videoLayers.forEach(lData => {
      if (!lData || seenIds.has(lData.id)) return;
      seenIds.add(lData.id);
      if (lData.x <= 1 && lData.width <= 1) {
        lData.x = Math.round(lData.x * 1920);
        lData.y = Math.round(lData.y * 1080);
        lData.width = Math.round(lData.width * 1920);
      }
      const l = createLayerFromData(lData);
      if (l) this.scene.addLayer(l);
    });

    if (!this.scene.getSelectedLayer()) {
      this.scene.selectLayer(this.scene.layers[0]?.id || 'layer_captions');
    }
    if (!this.scene.getLayer('layer_captions')) {
      this.scene.addLayer(new TranscriptionLayer({
        id: 'layer_captions',
        name: 'Synced Captions',
        x: 880, y: 240, width: 920, fontSize: 54, fill: '#111827', align: 'left',
        text: this.el.bookText.value.slice(0, 140) || '', startTime: 0, endTime: 999999
      }));
    }
    if (!this.scene.getLayer('layer_player_widget')) {
      this.scene.addLayer(new AudioWidgetLayer({
        id: 'layer_player_widget',
        name: 'Audio Player Bar',
        x: 840, y: 720, width: 940, color: '#111827', thickness: 2.5, playheadRadius: 7,
        startTime: 0, endTime: 999999
      }));
    }
    this.scene.layers.forEach(l => {
      if (l.endTime === 10 || typeof l.endTime !== 'number') l.endTime = 999999;
    });
  }
}
