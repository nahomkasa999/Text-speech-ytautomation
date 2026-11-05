/**
 * Studio Playback Coordinator: requestAnimationFrame animation loop & transport toggles.
 */

import { showToast } from '../../ui/toast.js';

export class StudioPlayback {
  constructor({ el, state, scene, callbacks }) {
    this.el = el;
    this.state = state;
    this.scene = scene;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  togglePlay() {
    if (!this.el.videoAudioPlayer.src) {
      showToast('Please select or generate a narration project first.', 'error');
      return;
    }

    if (!this.el.videoAudioPlayer.paused) {
      this.el.videoAudioPlayer.pause();
      this.state.video.isPlaying = false;
      this.el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    } else {
      this.el.videoAudioPlayer.playbackRate = this.state.video.audioSpeed;
      this.el.videoAudioPlayer.volume = this.state.video.audioVolume;
      this.el.videoAudioPlayer.preservesPitch = this.state.video.preservePitch;
      const playPromise = this.el.videoAudioPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          this.state.video.isPlaying = true;
          this.el.videoPlaySvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          requestAnimationFrame(() => this.loop());
        }).catch(err => {
          console.error('Audio playback error:', err);
          showToast('Audio error: Click on the page or select a chapter to enable audio playback.', 'error');
        });
      }
    }
  }

  stop() {
    this.el.videoAudioPlayer.pause();
    this.el.videoAudioPlayer.currentTime = 0;
    this.state.video.isPlaying = false;
    this.el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    this.callbacks.updatePlayheadPosition(0, this.el.videoAudioPlayer.duration || 1);
    this.callbacks.renderVideoFrame(0);
  }

  loop() {
    if (!this.state.video.isPlaying && !this.state.video.isExporting) return;
    const cur = this.el.videoAudioPlayer.currentTime;
    const dur = this.el.videoAudioPlayer.duration || 1;

    this.callbacks.renderVideoFrame(cur);
    this.callbacks.updatePlayheadPosition(cur, dur);

    const selected = this.scene.getSelectedLayer();
    if (selected && selected.type === 'transcription') {
      this.callbacks.updateSelectionBox?.();
    }

    if (cur >= dur) {
      this.state.video.isPlaying = false;
      this.el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      return;
    }
    requestAnimationFrame(() => this.loop());
  }

  attachEvents() {
    this.el.btnVideoPlay.addEventListener('click', () => this.togglePlay());
    this.el.btnVideoStop.addEventListener('click', () => this.stop());

    this.el.videoAudioPlayer.addEventListener('play', () => {
      this.state.video.isPlaying = true;
      this.el.videoPlaySvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      requestAnimationFrame(() => this.loop());
    });

    this.el.videoAudioPlayer.addEventListener('pause', () => {
      this.state.video.isPlaying = false;
      this.el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    });

    this.el.videoAudioPlayer.addEventListener('ended', () => {
      this.state.video.isPlaying = false;
      this.el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      this.callbacks.updatePlayheadPosition(0, this.el.videoAudioPlayer.duration || 1);
      this.callbacks.renderVideoFrame(0);
    });

    this.el.videoAudioPlayer.addEventListener('loadedmetadata', () => {
      this.callbacks.buildTimelineRulerAndTracks();
      this.callbacks.updatePlayheadPosition(0, this.el.videoAudioPlayer.duration);
    });
  }
}
