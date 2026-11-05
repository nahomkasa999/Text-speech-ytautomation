/**
 * View Mode Switching Coordinator (Narration View vs Video Studio View).
 */

export class ModeSwitcher {
  constructor({ el, state, callbacks }) {
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;
    this.currentMode = 'narration';

    this.attachEvents();
  }

  setMode(mode) {
    this.currentMode = mode;
    this.el.tabModeNarration.classList.toggle('active', mode === 'narration');
    this.el.tabModeVideo.classList.toggle('active', mode === 'video');

    if (mode === 'narration') {
      this.el.narrationView.classList.remove('hidden');
      this.el.videoStudioView.classList.add('hidden');
      this.el.panelVoiceSettings.classList.remove('hidden');
      this.el.panelVideoSettings.classList.add('hidden');
    } else {
      this.el.narrationView.classList.add('hidden');
      this.el.videoStudioView.classList.remove('hidden');
      this.el.panelVoiceSettings.classList.add('hidden');
      this.el.panelVideoSettings.classList.remove('hidden');

      if (this.state.sessions.length > 0 && (!this.state.activeSession || !this.el.mainAudioPlayer.src)) {
        this.callbacks.selectSession?.(this.state.sessions[0]);
      } else if (this.state.activeSession) {
        this.callbacks.buildTimeline?.();
        this.callbacks.updatePlayhead?.(this.el.mainAudioPlayer.currentTime || 0, this.el.mainAudioPlayer.duration || 10);
      }
      this.callbacks.initVideoStudio?.();
      requestAnimationFrame(() => this.callbacks.fitCanvas?.());
      setTimeout(() => this.callbacks.fitCanvas?.(), 100);
    }
  }

  attachEvents() {
    this.el.tabModeNarration.addEventListener('click', () => this.setMode('narration'));
    this.el.tabModeVideo.addEventListener('click', () => this.setMode('video'));
    this.el.btnOpenInVideoStudio.addEventListener('click', () => this.setMode('video'));
    this.el.btnQuickSwitchVideo?.addEventListener('click', () => this.setMode('video'));
  }
}
