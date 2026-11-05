/**
 * Engine Switching & Voice Dropdown Selection Manager.
 */

import { fetchVoicesApi, fetchStatusApi } from '../services/api.js';

export class EngineSelector {
  constructor({ el, state, onEngineChanged, onVoiceChanged }) {
    this.el = el;
    this.state = state;
    this.onEngineChanged = onEngineChanged;
    this.onVoiceChanged = onVoiceChanged;

    this.attachEvents();
  }

  async initialize() {
    try {
      const [voicesRes, statusRes] = await Promise.all([
        fetchVoicesApi(),
        fetchStatusApi()
      ]);
      this.state.voices = voicesRes;
      this.renderVoices();
      if (statusRes.local_model_ready) {
        this.el.engineStatusDot.classList.add('ready');
        this.el.engineStatusText.textContent = 'Kokoro-82M Ready (Local)';
      }
    } catch (e) {
      console.warn('Engine init warning:', e);
    }
  }

  renderVoices() {
    const list = this.state.voices[this.state.engine] || [];
    this.el.voiceSelect.innerHTML = '';
    list.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      if (v.default || v.id === this.state.selectedVoice) {
        opt.selected = true;
        this.state.selectedVoice = v.id;
      }
      this.el.voiceSelect.appendChild(opt);
    });
    this.updateVoiceDescription();
  }

  updateVoiceDescription() {
    const list = this.state.voices[this.state.engine] || [];
    const current = list.find(v => v.id === this.el.voiceSelect.value);
    this.el.voiceDesc.textContent = (current && current.description)
      ? current.description
      : 'High fidelity neural narration';
    this.state.selectedVoice = this.el.voiceSelect.value;
  }

  attachEvents() {
    this.el.engineTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.state.engine = tab.dataset.engine;
        this.el.engineTabs.forEach(t => t.classList.toggle('active', t.dataset.engine === this.state.engine));
        this.el.panelDeployedSettings.classList.toggle('hidden', this.state.engine !== 'deployed');
        this.el.panelCloudSettings.classList.toggle('hidden', this.state.engine !== 'cloud_api');
        this.renderVoices();
        this.onEngineChanged?.();
      });
    });

    this.el.voiceSelect.addEventListener('change', () => {
      this.updateVoiceDescription();
      this.onVoiceChanged?.();
    });
  }
}
