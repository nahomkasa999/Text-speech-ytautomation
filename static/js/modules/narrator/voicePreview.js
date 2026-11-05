/**
 * Quick 1-2 second Voice Preview Sample Player.
 */

import { previewVoiceApi } from '../services/api.js';
import { showToast } from '../ui/toast.js';

export function setupVoicePreview({ el, state }) {
  if (!el.btnPreviewVoice) return;

  el.btnPreviewVoice.addEventListener('click', async () => {
    el.btnPreviewVoice.disabled = true;
    const txt = el.btnPreviewVoice.querySelector('span') || el.btnPreviewVoice;
    const orig = txt.textContent;
    txt.textContent = 'Loading...';

    const payload = {
      engine: state.engine,
      voice: el.voiceSelect.value,
      speed: state.speed,
      endpoint_url: el.deployedEndpoint ? el.deployedEndpoint.value.trim() : '',
      api_key: state.engine === 'deployed'
        ? (el.deployedToken ? el.deployedToken.value.trim() : '')
        : (state.engine === 'voice_design'
            ? (el.geminiApiKey?.value.trim() || localStorage.getItem('book_narrator_gemini_api_key') || '')
            : (el.cloudApiKey ? el.cloudApiKey.value.trim() : '')),
      instruction: el.deployedInstruction ? el.deployedInstruction.value.trim() : '',
      cloud_provider: el.cloudProvider ? el.cloudProvider.value : 'openai'
    };

    try {
      const data = await previewVoiceApi(payload);
      if (data.success && data.audio_url) {
        el.previewAudioPlayer.src = data.audio_url;
        el.previewAudioPlayer.play();
      } else {
        showToast(`Preview error: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast(`Preview error: ${err.message}`, 'error');
    } finally {
      el.btnPreviewVoice.disabled = false;
      txt.textContent = orig;
    }
  });
}
