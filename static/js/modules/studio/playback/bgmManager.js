/**
 * Background Music (BGM) Manager: controls background audio, volume, and playback synchronization.
 */

import { showToast } from '../../ui/toast.js';

export class BgmManager {
  constructor({ el, state, callbacks }) {
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;
    this.audio = new Audio();
    this.audio.loop = true;

    this.initControls();
  }

  initControls() {
    this.bgmVolumeSlider = document.getElementById('bgm-volume-slider');
    this.bgmVolumeVal = document.getElementById('bgm-volume-val');
    this.btnBgmMute = document.getElementById('btn-bgm-mute');
    this.btnAddBgm = document.getElementById('btn-add-bgm');
    this.bgmAudioUploader = document.getElementById('bgm-audio-uploader');

    if (this.btnAddBgm && this.bgmAudioUploader) {
      this.btnAddBgm.addEventListener('click', () => this.bgmAudioUploader.click());
      this.bgmAudioUploader.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.loadBgmFile(file);
      });
    }

    if (this.bgmVolumeSlider) {
      this.bgmVolumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setVolume(val);
      });
    }

    if (this.btnBgmMute) {
      this.btnBgmMute.addEventListener('click', () => this.toggleMute());
    }
  }

  loadBgmFile(file) {
    const url = URL.createObjectURL(file);
    this.loadBgm(url, file.name);
    showToast(`Loaded background music: ${file.name}`, 'success');
  }

  loadBgm(url, name = 'Music Track') {
    this.audio.src = url;
    this.audio.volume = this.state.video.bgm?.isMuted ? 0 : (this.state.video.bgm?.volume ?? 0.35);
    this.state.video.bgm = {
      url,
      name,
      volume: this.state.video.bgm?.volume ?? 0.35,
      isMuted: this.state.video.bgm?.isMuted ?? false,
      loop: true
    };
    this.renderTrack();
    this.callbacks.saveDraft?.();
  }

  setVolume(vol) {
    if (!this.state.video.bgm) this.state.video.bgm = { volume: vol, isMuted: false, loop: true };
    this.state.video.bgm.volume = vol;
    if (!this.state.video.bgm.isMuted) {
      this.audio.volume = vol;
    }
    if (this.bgmVolumeVal) this.bgmVolumeVal.textContent = `${Math.round(vol * 100)}%`;
    this.callbacks.saveDraft?.();
  }

  toggleMute() {
    if (!this.state.video.bgm) return;
    this.state.video.bgm.isMuted = !this.state.video.bgm.isMuted;
    this.audio.volume = this.state.video.bgm.isMuted ? 0 : this.state.video.bgm.volume;
    if (this.btnBgmMute) {
      this.btnBgmMute.classList.toggle('active', this.state.video.bgm.isMuted);
    }
    this.callbacks.saveDraft?.();
  }

  syncPlayback(isPlaying, currentTime) {
    if (!this.state.video.bgm?.url) return;
    if (isPlaying) {
      if (this.audio.duration && !isNaN(this.audio.duration)) {
        this.audio.currentTime = currentTime % this.audio.duration;
      }
      this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }

  renderTrack() {
    const track = document.getElementById('track-bgm');
    const lane = document.getElementById('lane-bgm');
    if (!track || !lane) return;
    if (this.state.video.bgm?.url) {
      track.style.display = 'flex';
      lane.innerHTML = `<div class="bgm-block active"><span class="bgm-icon">🎵</span> ${this.state.video.bgm.name || 'Background Music'}</div>`;
    } else {
      track.style.display = 'none';
      lane.innerHTML = '';
    }
  }
}
