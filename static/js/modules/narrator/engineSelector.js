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
    this.syncEngineDropdown();
  }

  /** Keeps the dropdown button showing the selected engine (also after a draft restore). */
  syncEngineDropdown() {
    const label = document.getElementById('engine-trigger-label');
    const icon = document.getElementById('engine-trigger-icon');
    if (!label) return;
    const update = () => {
      const active = [...this.el.engineTabs].find(t => t.classList.contains('active')) || this.el.engineTabs[0];
      if (!active) return;
      label.textContent = active.querySelector('.tab-title')?.textContent || active.dataset.engine;
      if (icon) icon.innerHTML = active.querySelector('.tab-icon')?.innerHTML || '';
      this.el.engineTabs.forEach(t => t.setAttribute('aria-selected', t === active ? 'true' : 'false'));
    };
    const observer = new MutationObserver(update);
    this.el.engineTabs.forEach(t => observer.observe(t, { attributes: true, attributeFilter: ['class'] }));
    update();
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

  /** Voices for the active engine; Gemini also lists the user's designed voices first. */
  getVoiceList() {
    const list = this.state.voices[this.state.engine] || [];
    if (this.state.engine === 'voice_design') return [...(this.state.designedVoices || []), ...list];
    return list;
  }

  renderVoices() {
    const list = this.getVoiceList();
    this.el.voiceSelect.innerHTML = '';
    list.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      this.el.voiceSelect.appendChild(opt);
    });
    // Keep the saved voice if this engine has it, otherwise use the engine's default.
    const keep = list.find(v => v.id === this.state.selectedVoice) || list.find(v => v.default) || list[0];
    if (keep) {
      this.el.voiceSelect.value = keep.id;
      this.state.selectedVoice = keep.id;
    }
    this.updateVoiceDescription();
  }

  updateVoiceDescription() {
    const list = this.getVoiceList();
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
        if (this.el.panelVoiceDesignSettings) {
          this.el.panelVoiceDesignSettings.classList.toggle('hidden', this.state.engine !== 'voice_design');
        }
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
