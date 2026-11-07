/**
 * Gemini Voices Manager: API key handling, loading the user's designed voices,
 * and creating + auditioning new designed voices (Gemini Voices API).
 */

import { showToast } from '../ui/toast.js';

const KEY_STORAGE = 'book_narrator_gemini_api_key';

export class VoiceDesignManager {
  constructor({ el, state, callbacks }) {
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;
    this.state.designedVoices = this.state.designedVoices || [];
    this.loadToken = 0;
    this.keyTimer = null;

    this.initApiKey();
    this.attachEvents();
  }

  getApiKey() {
    let saved = '';
    try { saved = localStorage.getItem(KEY_STORAGE) || ''; } catch (e) {}
    return this.el.geminiApiKey?.value.trim() || saved;
  }

  setStatus(text, isError = false) {
    if (!this.el.geminiKeyStatus) return;
    this.el.geminiKeyStatus.textContent = text;
    this.el.geminiKeyStatus.style.color = isError ? '#dc2626' : '';
  }

  initApiKey() {
    const key = this.getApiKey();
    if (key && this.el.geminiApiKey) this.el.geminiApiKey.value = key;
    if (key) this.loadDesignedVoices({ quiet: true });
  }

  attachEvents() {
    this.el.geminiApiKey?.addEventListener('input', (e) => {
      const key = e.target.value.trim();
      try { localStorage.setItem(KEY_STORAGE, key); } catch (err) {}
      clearTimeout(this.keyTimer);
      if (!key) {
        this.state.designedVoices = [];
        this.callbacks.renderVoices?.();
        this.setStatus('Get a key at aistudio.google.com/api-keys. Then pick a voice under "Narrator Voice" above.');
        return;
      }
      this.keyTimer = setTimeout(() => this.loadDesignedVoices({ quiet: false }), 700);
    });

    this.el.btnCreateDesignedVoice?.addEventListener('click', () => this.createVoice());
  }

  /** Loads the designed voices stored in the user's Google project (also validates the key). */
  async loadDesignedVoices({ quiet }) {
    const key = this.getApiKey();
    if (!key) return;
    const token = ++this.loadToken;
    this.setStatus('Checking key…');
    try {
      const res = await fetch(`/api/voice-design/list?api_key=${encodeURIComponent(key)}`);
      const data = await res.json().catch(() => ({}));
      if (token !== this.loadToken) return;
      if (!res.ok) throw new Error(data.detail || `Server error (${res.status})`);
      this.state.designedVoices = data.voices || [];
      this.callbacks.renderVoices?.();
      const n = this.state.designedVoices.length;
      this.setStatus(`✓ Key works. 30 Gemini voices${n ? ` + ${n} designed voice${n > 1 ? 's' : ''}` : ''} available above.`);
      if (!quiet) showToast('Gemini key connected. Voices are ready.', 'success');
    } catch (err) {
      if (token !== this.loadToken) return;
      this.setStatus(`Key problem: ${err.message}`, true);
      if (!quiet) showToast(`Gemini key problem: ${err.message}`, 'error');
    }
  }

  async createVoice() {
    const apiKey = this.getApiKey();
    const prompt = this.el.voiceDesignPrompt?.value.trim();
    const name = this.el.voiceDesignName?.value.trim() || 'Custom Persona';
    const gender = this.el.voiceDesignGender?.value || 'male';

    if (!apiKey) {
      showToast('Please enter your Gemini API Key.', 'error');
      return;
    }
    if (!prompt) {
      showToast('Please describe the vocal persona (timbre, age, accent, delivery).', 'error');
      return;
    }

    const btn = this.el.btnCreateDesignedVoice;
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>Designing voice… (can take up to a minute)</span>';

    try {
      const res = await fetch('/api/voice-design/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          description: prompt,
          display_name: name,
          gender,
          language_code: 'en-US',
          model: 'gemini-3.8-flash-tts'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Server error (${res.status})`);

      const voice = data.voice;
      this.state.designedVoices = [voice, ...this.state.designedVoices.filter(v => v.id !== voice.id)];
      this.state.selectedVoice = voice.id;
      this.callbacks.renderVoices?.();

      if (data.preview_url && this.el.previewAudioPlayer) {
        this.el.previewAudioPlayer.src = data.preview_url;
        this.el.previewAudioPlayer.play().catch(() => {});
      }

      showToast(`Created voice "${name}". Playing the audition sample…`, 'success');
      this.callbacks.onVoiceCreated?.();
    } catch (err) {
      showToast(`Voice design failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }
}
