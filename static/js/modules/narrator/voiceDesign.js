/**
 * Voice Design Manager: Gemini Voices API Persona Creation and Auditioning.
 */

import { showToast } from '../ui/toast.js';

export class VoiceDesignManager {
  constructor({ el, state, callbacks }) {
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;

    this.initApiKey();
    this.attachEvents();
  }

  initApiKey() {
    const savedKey = localStorage.getItem('book_narrator_gemini_api_key');
    if (savedKey && this.el.geminiApiKey) {
      this.el.geminiApiKey.value = savedKey;
    }
  }

  attachEvents() {
    if (this.el.geminiApiKey) {
      this.el.geminiApiKey.addEventListener('input', (e) => {
        localStorage.setItem('book_narrator_gemini_api_key', e.target.value.trim());
      });
    }

    if (this.el.btnCreateDesignedVoice) {
      this.el.btnCreateDesignedVoice.addEventListener('click', () => this.createVoice());
    }
  }

  async createVoice() {
    const apiKey = this.el.geminiApiKey?.value.trim() || localStorage.getItem('book_narrator_gemini_api_key');
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
    btn.innerHTML = '<span>Designing Persona & Auditioning...</span>';

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

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      const voiceId = data.voice_id;
      const displayName = `${name} (${voiceId.slice(-6)})`;

      if (!this.state.voices.voice_design) {
        this.state.voices.voice_design = [];
      }

      this.state.voices.voice_design.unshift({
        id: voiceId,
        name: displayName,
        gender,
        description: prompt
      });

      this.callbacks.renderVoices?.();
      this.el.voiceSelect.value = voiceId;
      this.state.selectedVoice = voiceId;

      if (data.preview_url && this.el.previewAudioPlayer) {
        this.el.previewAudioPlayer.src = data.preview_url;
        this.el.previewAudioPlayer.play().catch(() => {});
      }

      showToast(`Created Voice: ${displayName}! Auditioning sample...`, 'success');
      this.callbacks.onVoiceCreated?.();
    } catch (err) {
      showToast(`Voice design failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }
}
