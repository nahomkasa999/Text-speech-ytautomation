/**
 * Studio Audio Controls: speed, volume, mute, and pitch correction.
 */

export class StudioAudioControls {
  constructor({ el, state, onSettingChanged }) {
    this.el = el;
    this.state = state;
    this.onSettingChanged = onSettingChanged;

    this.attachEvents();
  }

  setSpeed(spd, triggerSave = true) {
    const clamped = Math.max(0.5, Math.min(2.5, Math.round(parseFloat(spd) * 100) / 100));
    this.state.video.audioSpeed = clamped;
    this.el.videoAudioPlayer.playbackRate = clamped;

    if (this.el.videoSpeedSlider) this.el.videoSpeedSlider.value = clamped;
    if (this.el.videoSpeedVal) this.el.videoSpeedVal.textContent = clamped.toFixed(2) + 'x';
    if (this.el.inspectorSpeedSlider) this.el.inspectorSpeedSlider.value = clamped;
    if (this.el.inspectorSpeedVal) this.el.inspectorSpeedVal.textContent = clamped.toFixed(2) + 'x';

    this.el.speedBtns.forEach(b => {
      const bSpeed = parseFloat(b.dataset.speed);
      b.classList.toggle('active', Math.abs(bSpeed - clamped) < 0.02);
    });

    if (triggerSave) this.onSettingChanged?.();
  }

  setVolume(vol, isUser = true) {
    const clamped = Math.max(0, Math.min(1.0, Math.round(parseFloat(vol) * 100) / 100));
    this.state.video.audioVolume = clamped;
    this.el.videoAudioPlayer.volume = clamped;

    if (this.el.audioVolumeSlider) this.el.audioVolumeSlider.value = clamped;
    if (this.el.audioVolumeVal) this.el.audioVolumeVal.textContent = Math.round(clamped * 100) + '%';
    if (this.el.inspectorVolumeSlider) this.el.inspectorVolumeSlider.value = clamped;
    if (this.el.inspectorVolumeVal) this.el.inspectorVolumeVal.textContent = Math.round(clamped * 100) + '%';

    if (clamped === 0) {
      this.state.video.isMuted = true;
      if (this.el.svgAudioVol) {
        this.el.svgAudioVol.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
      }
    } else {
      if (isUser) {
        this.state.video.isMuted = false;
        this.state.video.lastVolume = clamped;
      }
      if (this.el.svgAudioVol) {
        this.el.svgAudioVol.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
      }
    }

    if (isUser) this.onSettingChanged?.();
  }

  toggleMute() {
    if (this.state.video.isMuted || this.state.video.audioVolume === 0) {
      this.setVolume(this.state.video.lastVolume || 1.0, true);
    } else {
      this.state.video.lastVolume = this.state.video.audioVolume;
      this.setVolume(0, true);
    }
  }

  setPreservePitch(enabled) {
    this.state.video.preservePitch = !!enabled;
    this.el.videoAudioPlayer.preservesPitch = !!enabled;
    if ('mozPreservesPitch' in this.el.videoAudioPlayer) this.el.videoAudioPlayer.mozPreservesPitch = !!enabled;
    if (this.el.checkPitchCorrection) this.el.checkPitchCorrection.checked = !!enabled;
    this.onSettingChanged?.();
  }

  attachEvents() {
    if (this.el.btnAudioMute) this.el.btnAudioMute.addEventListener('click', () => this.toggleMute());
    if (this.el.audioVolumeSlider) {
      this.el.audioVolumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value, true));
    }
    if (this.el.inspectorVolumeSlider) {
      this.el.inspectorVolumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value, true));
    }
    if (this.el.videoSpeedSlider) {
      this.el.videoSpeedSlider.addEventListener('input', (e) => this.setSpeed(e.target.value, true));
    }
    if (this.el.inspectorSpeedSlider) {
      this.el.inspectorSpeedSlider.addEventListener('input', (e) => this.setSpeed(e.target.value, true));
    }
    if (this.el.checkPitchCorrection) {
      this.el.checkPitchCorrection.addEventListener('change', (e) => this.setPreservePitch(e.target.checked));
    }
    this.el.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.setSpeed(parseFloat(btn.dataset.speed), true);
      });
    });
  }
}
