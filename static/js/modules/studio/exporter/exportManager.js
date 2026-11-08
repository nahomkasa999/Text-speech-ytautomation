/**
 * Video Studio Export Manager: orchestrates fast WebCodecs export and real-time fallback.
 */

import { exportVideoFast, isFastExportSupported, ExportCancelledError } from '../../../video/exporter.js';
import { saveBlob } from '../../services/fileSaver.js';
import { runRealtimeExport } from './realtimeRecorder.js';
import { ExportOptionsModal } from './exportOptionsModal.js';
import { showToast } from '../../ui/toast.js';

export class ExportManager {
  constructor({ el, state, scene, callbacks }) {
    this.el = el;
    this.state = state;
    this.scene = scene;
    this.callbacks = callbacks;
    this.exportAbort = null;
    this.optionsModal = new ExportOptionsModal({
      onConfirm: (opts) => this.executeExport(opts)
    });

    this.attachEvents();
  }

  getExportFilename() {
    return (this.state.activeSession?.title || 'youtube_book_automation').replace(/[^a-z0-9_-]/gi, '_');
  }

  downloadBlob(blob, filename) {
    // Native "Save As..." dialog in the desktop app; normal download in a browser.
    return saveBlob(blob, filename);
  }

  preloadSceneImages() {
    return Promise.all(
      this.scene.layers
        .filter(l => l.type === 'image' && l.src && !l._loadedImage)
        .map(l => new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { l._loadedImage = img; resolve(); };
          img.onerror = () => resolve();
          img.src = l.src;
        }))
    );
  }

  async runFastExport(audioUrl, exportOpts) {
    this.exportAbort = new AbortController();
    this.el.exportBtnLabel.textContent = 'Preparing… (click to cancel)';
    await Promise.all([document.fonts?.ready, this.preloadSceneImages()]);

    const startedAt = performance.now();
    const { blob, ext, codecs } = await exportVideoFast({
      width: exportOpts.width || 1920,
      height: exportOpts.height || 1080,
      renderFrame: (ctx, t) => this.callbacks.renderVideoFrame(t, ctx),
      audioUrl,
      musicUrl: exportOpts.includeBgm ? this.state.video.bgm?.url : null,
      musicVolume: this.state.video.bgm?.volume ?? 0.35,
      speed: this.state.video.audioSpeed,
      volume: this.state.video.audioVolume,
      preservePitch: this.state.video.preservePitch,
      fps: 30,
      videoBitrate: 6000000,
      signal: this.exportAbort.signal,
      onProgress: (p, stage, audioTime) => {
        this.el.exportBtnLabel.textContent = `${stage} ${Math.round(p * 100)}% (click to cancel)`;
        if (audioTime !== undefined) {
          this.callbacks.updatePlayheadPosition(audioTime, this.el.videoAudioPlayer.duration || 1);
        }
      }
    });

    const filename = `${this.getExportFilename()}.${ext}`;
    this.downloadBlob(blob, filename);
    const secs = ((performance.now() - startedAt) / 1000).toFixed(1);
    console.info(`[Export] ${filename} (${codecs}, ${(blob.size / 1e6).toFixed(1)} MB) in ${secs}s`);
    showToast(`Video rendered in ${secs}s. Choose where to save it.`, 'success');
  }

  finishUI() {
    this.el.figmaSelectionBox.classList.remove('hidden');
    this.el.btnExportMp4.disabled = false;
    this.el.exportBtnLabel.textContent = 'Export MP4';
    this.state.video.isExporting = false;
    this.state.video.isPlaying = false;
    this.exportAbort = null;
    this.callbacks.renderVideoFrame(this.el.videoAudioPlayer.currentTime || 0);
  }

  async executeExport(exportOpts = {}) {
    const audioUrl = this.state.activeSession?.audio_url || this.el.videoAudioPlayer.src;
    this.state.video.isExporting = true;
    this.el.figmaSelectionBox.classList.add('hidden');
    this.el.videoAudioPlayer.pause();
    this.el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';

    try {
      if (exportOpts.format !== 'webm' && isFastExportSupported()) {
        try {
          await this.runFastExport(audioUrl, exportOpts);
          return;
        } catch (err) {
          if (err instanceof ExportCancelledError) {
            showToast('Export cancelled.', 'info');
            return;
          }
          console.warn('[Export] Fast export failed, falling back to real-time recording:', err);
        }
      }
      this.el.btnExportMp4.disabled = true;
      await runRealtimeExport({
        audioUrl,
        canvasEl: this.el.videoCanvas,
        audioSpeed: this.state.video.audioSpeed,
        audioVolume: this.state.video.audioVolume,
        preservePitch: this.state.video.preservePitch,
        getExportFilename: () => this.getExportFilename(),
        downloadBlob: (b, f) => this.downloadBlob(b, f),
        renderVideoFrame: (t) => this.callbacks.renderVideoFrame(t),
        updatePlayheadPosition: (c, d) => this.callbacks.updatePlayheadPosition(c, d),
        state: this.state,
        exportBtnLabel: this.el.exportBtnLabel
      });
    } catch (err) {
      showToast(`Export error: ${err.message}`, 'error');
    } finally {
      this.finishUI();
    }
  }

  attachEvents() {
    this.el.btnExportMp4.addEventListener('click', () => {
      if (this.state.video.isExporting) {
        this.exportAbort?.abort();
      } else {
        this.optionsModal.show();
      }
    });
  }
}
