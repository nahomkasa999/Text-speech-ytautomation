/**
 * Video Studio Export Manager: uses native CPU encoding in the desktop app.
 */

import { exportVideoFast, isFastExportSupported, ExportCancelledError } from '../../../video/exporter.js';
import { saveBlob, saveServerFile } from '../../services/fileSaver.js';
import { exportVideoNative, hasNativeExport } from '../../../video/nativeExporter.js';
import { ExportProgress } from './exportProgress.js';
import { ExportOptionsModal } from './exportOptionsModal.js';
import { showToast } from '../../ui/toast.js';

// Browser audio decoding remains limited to short MP4 exports.
const BROWSER_EXPORT_MAX_SECONDS = 10 * 60;

function formatEta(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

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

  progressLabel(stage, p, now) {
    if (stage !== this.etaStage) {
      this.etaStage = stage;
      this.etaStart = { t: now, p };
    }
    const pct = `${Math.round(p * 100)}%`;
    const elapsed = (now - this.etaStart.t) / 1000;
    const done = p - this.etaStart.p;
    const eta = (stage === 'Rendering video' && done > 0.002 && elapsed > 3)
      ? ` · ${formatEta((elapsed / done) * (1 - p))} left`
      : '';
    return `${stage} ${pct}${eta} (click to cancel)`;
  }

  async saveExport(url, filename) {
    const saved = await saveServerFile(`${url}?name=${encodeURIComponent(filename)}`, filename);
    if (!saved) {
      showToast('Video was not saved yet.', 'info', {
        duration: 60000,
        actionLabel: 'Save…',
        onAction: () => this.saveExport(url, filename)
      });
    }
  }

  async runFastExport(audioUrl, exportOpts) {
    this.exportAbort = new AbortController();
    this.etaStage = null;
    this.el.exportBtnLabel.textContent = 'Preparing… (click to cancel)';
    await Promise.all([document.fonts?.ready, this.preloadSceneImages()]);

    const startedAt = performance.now();
    const { url, size, ext, codecs } = await exportVideoFast({
      width: exportOpts.width || 1920,
      height: exportOpts.height || 1080,
      renderFrame: (ctx, t) => this.callbacks.renderVideoFrame(t, ctx),
      audioUrl,
      musicUrl: exportOpts.includeBgm ? this.state.video.bgm?.url : null,
      musicVolume: this.state.video.bgm?.volume ?? 0.35,
      speed: this.state.video.audioSpeed,
      volume: this.state.video.audioVolume,
      preservePitch: this.state.video.preservePitch,
      fps: exportOpts.fps || 30,
      videoBitrate: 6000000,
      signal: this.exportAbort.signal,
      onProgress: (p, stage, audioTime) => {
        this.el.exportBtnLabel.textContent = this.progressLabel(stage, p, performance.now());
        if (audioTime !== undefined) {
          this.callbacks.updatePlayheadPosition(audioTime, this.el.videoAudioPlayer.duration || 1);
        }
      }
    });

    const filename = `${this.getExportFilename()}.${ext}`;
    const took = formatEta((performance.now() - startedAt) / 1000);
    console.info(`[Export] ${filename} (${codecs}, ${(size / 1e6).toFixed(1)} MB) in ${took}`);
    showToast(`Video rendered in ${took}. Choose where to save it.`, 'success');
    await this.saveExport(url, filename);
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
    let progress;
    try {
      if (hasNativeExport()) {
        this.exportAbort = new AbortController();
        progress = new ExportProgress(() => this.exportAbort.abort());
        const music = this.state.video.bgm;
        const result = await exportVideoNative({
          scene: this.scene,
          bgImage: this.state.video.bgImage,
          settings: {
            filename: `${this.getExportFilename()}.${exportOpts.format || 'mp4'}`,
            format: exportOpts.format || 'mp4',
            width: exportOpts.width || 1920, height: exportOpts.height || 1080,
            fps: exportOpts.fps || 30, audio_url: audioUrl, cpu_preset: exportOpts.cpuPreset,
            speed: this.state.video.audioSpeed,
            volume: this.state.video.audioVolume,
            preserve_pitch: this.state.video.preservePitch,
            music_volume: music?.volume ?? 0.35,
          },
          musicUrl: exportOpts.includeBgm && !music?.isMuted ? music?.url : null,
          signal: this.exportAbort.signal,
          onProgress: status => {
            progress.update(status);
            this.el.exportBtnLabel.textContent = `${status.stage || 'Exporting'} (click to cancel)`;
          },
          onFrame: time => this.callbacks.updatePlayheadPosition(time, this.el.videoAudioPlayer.duration || 1),
        });
        const path = result.video_path === 'webcodecs'
          ? `WebCodecs ${result.video_codec} (${result.video_hardware_acceleration}), FFmpeg copies the video`
          : `raw frames, FFmpeg encodes the video${result.video_fallback_reason ? `; WebCodecs unavailable: ${result.video_fallback_reason}` : ''}`;
        console.info(`[Export] Native export: ${path}`, result);
        showToast(`Video saved in ${formatEta(result.elapsed_seconds)}.`, 'success', {
          actionLabel: 'Show in folder',
          onAction: () => window.pywebview.api.reveal(result.path),
        });
        return;
      }
      const duration = this.el.videoAudioPlayer.duration / this.state.video.audioSpeed;
      if (!Number.isFinite(duration) || duration <= 0 || duration > BROWSER_EXPORT_MAX_SECONDS ||
          this.el.videoAudioPlayer.duration > BROWSER_EXPORT_MAX_SECONDS ||
          exportOpts.format === 'webm' || !isFastExportSupported()) {
        throw new Error('Use the desktop app for long videos and WebM exports. Native CPU export needs the full installer with FFmpeg. No real-time recording was started.');
      }
      await this.runFastExport(audioUrl, exportOpts);
    } catch (err) {
      if (err instanceof ExportCancelledError) showToast('Export cancelled. Unfinished files removed.', 'info');
      else showToast(`Export error: ${err.message}`, 'error');
    } finally {
      progress?.close();
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
