/**
 * Media Importer: imports video clips, audio tracks, and images into the studio.
 */

import { showToast } from '../../ui/toast.js';

export class MediaImporter {
  constructor({ el, state, scene, callbacks }) {
    this.el = el;
    this.state = state;
    this.scene = scene;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  attachEvents() {
    const importInput = document.getElementById('media-importer-file');
    const importBtn = document.getElementById('btn-import-media');

    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', (e) => this.handleFiles(Array.from(e.target.files)));
    }
  }

  async handleFiles(files) {
    if (!files || files.length === 0) return;
    for (const file of files) {
      const type = file.type;
      const url = URL.createObjectURL(file);

      if (type.startsWith('audio/')) {
        await this.importAudio(file, url);
      } else if (type.startsWith('image/')) {
        await this.importImage(file, url);
      } else if (type.startsWith('video/')) {
        await this.importVideo(file, url);
      } else {
        showToast(`Unsupported media format: ${file.name}`, 'error');
      }
    }
  }

  async importAudio(file, url) {
    if (!this.state.video.bgm) {
      this.state.video.bgm = { url, name: file.name, volume: 0.35, isMuted: false, loop: true };
    } else {
      this.state.video.bgm.url = url;
      this.state.video.bgm.name = file.name;
    }
    this.callbacks.onBgmLoaded?.(this.state.video.bgm);
    showToast(`Imported audio: ${file.name}`, 'success');
    this.callbacks.saveDraft?.();
  }

  async importImage(file, url) {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {});

    const maxW = 800;
    const aspect = img.width && img.height ? img.width / img.height : 16 / 9;
    const w = Math.min(img.width || 600, maxW);
    const h = Math.round(w / aspect);

    const layer = {
      id: `img_${Date.now()}`,
      type: 'image',
      name: file.name.slice(0, 18),
      x: Math.round((1920 - w) / 2),
      y: Math.round((1080 - h) / 2),
      width: w,
      height: h,
      src: url,
      opacity: 1,
      visible: true,
      startTime: 0,
      endTime: this.el.videoAudioPlayer.duration || 10,
      fadeIn: 0.5,
      fadeOut: 0.5
    };

    this.scene.addLayer(layer);
    this.scene.selectLayer(layer.id);
    this.callbacks.renderLayersList?.();
    this.callbacks.renderVideoFrame?.();
    this.callbacks.updateSelectionBox?.();
    this.callbacks.saveDraft?.();
    showToast(`Added image layer: ${layer.name}`, 'success');
  }

  async importVideo(file, url) {
    const layer = {
      id: `vid_${Date.now()}`,
      type: 'video',
      name: file.name.slice(0, 18),
      x: 160,
      y: 90,
      width: 1600,
      height: 900,
      src: url,
      opacity: 1,
      visible: true,
      startTime: 0,
      endTime: this.el.videoAudioPlayer.duration || 10,
      fadeIn: 0.5,
      fadeOut: 0.5
    };

    this.scene.addLayer(layer);
    this.scene.selectLayer(layer.id);
    this.callbacks.renderLayersList?.();
    this.callbacks.renderVideoFrame?.();
    this.callbacks.updateSelectionBox?.();
    this.callbacks.saveDraft?.();
    showToast(`Added video clip: ${layer.name}`, 'success');
  }
}
