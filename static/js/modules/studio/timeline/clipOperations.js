/**
 * Timeline Clip Operations: split, trim, delete, and arrange clips.
 *
 * NOTE: Split and Trim are disabled for this release (planned for the next
 * version). Their buttons and keyboard shortcuts are commented out below; the
 * methods are kept so the feature can be switched back on easily.
 */

import { showToast } from '../../ui/toast.js';

export class ClipOperations {
  constructor({ scene, el, state, callbacks }) {
    this.scene = scene;
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  attachEvents() {
    // Split / Trim disabled for this release:
    // const btnSplit = document.getElementById('btn-timeline-split');
    // const btnTrimLeft = document.getElementById('btn-timeline-trim-left');
    // const btnTrimRight = document.getElementById('btn-timeline-trim-right');
    const btnDelete = document.getElementById('btn-timeline-delete-clip');

    // if (btnSplit) btnSplit.addEventListener('click', () => this.splitAtPlayhead());
    // if (btnTrimLeft) btnTrimLeft.addEventListener('click', () => this.trimStart());
    // if (btnTrimRight) btnTrimRight.addEventListener('click', () => this.trimEnd());
    if (btnDelete) btnDelete.addEventListener('click', () => this.deleteSelected());

    // Split (S) and Trim ([ / ]) keyboard shortcuts disabled for this release:
    // window.addEventListener('keydown', (e) => {
    //   if (e.target.matches('input, textarea')) return;
    //   if (e.key === 's' || e.key === 'S') {
    //     e.preventDefault();
    //     this.splitAtPlayhead();
    //   } else if (e.key === '[') {
    //     e.preventDefault();
    //     this.trimStart();
    //   } else if (e.key === ']') {
    //     e.preventDefault();
    //     this.trimEnd();
    //   }
    // });
  }

  getCurrentTime() {
    return this.el.videoAudioPlayer.currentTime || 0;
  }

  splitAtPlayhead() {
    const curTime = this.getCurrentTime();
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.id === 'layer_captions' || layer.id === 'layer_player_widget') {
      showToast('Select an image, video, or text clip to split.', 'info');
      return;
    }

    const start = layer.startTime || 0;
    const end = layer.endTime || (this.el.videoAudioPlayer.duration || 10);

    if (curTime <= start || curTime >= end) {
      showToast('Playhead is outside the selected clip boundary.', 'error');
      return;
    }

    const oldEnd = end;
    layer.endTime = curTime;

    const newLayer = {
      ...JSON.parse(JSON.stringify(layer)),
      id: `${layer.type}_${Date.now()}`,
      name: `${layer.name || 'Clip'} (Part 2)`,
      startTime: curTime,
      endTime: oldEnd,
      fadeIn: 0.3,
      fadeOut: 0.3
    };

    this.scene.addLayer(newLayer);
    this.scene.selectLayer(newLayer.id);
    this.callbacks.renderLayersList?.();
    this.callbacks.buildTimeline?.();
    this.callbacks.renderVideoFrame?.();
    this.callbacks.saveDraft?.();
    showToast(`Split clip at ${curTime.toFixed(1)}s`, 'success');
  }

  trimStart() {
    const curTime = this.getCurrentTime();
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.id === 'layer_captions' || layer.id === 'layer_player_widget') return;
    const end = layer.endTime || (this.el.videoAudioPlayer.duration || 10);
    if (curTime >= end) return;
    layer.startTime = curTime;
    this.callbacks.buildTimeline?.();
    this.callbacks.renderVideoFrame?.();
    this.callbacks.saveDraft?.();
    showToast(`Trimmed start to ${curTime.toFixed(1)}s`, 'success');
  }

  trimEnd() {
    const curTime = this.getCurrentTime();
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.id === 'layer_captions' || layer.id === 'layer_player_widget') return;
    const start = layer.startTime || 0;
    if (curTime <= start) return;
    layer.endTime = curTime;
    this.callbacks.buildTimeline?.();
    this.callbacks.renderVideoFrame?.();
    this.callbacks.saveDraft?.();
    showToast(`Trimmed end to ${curTime.toFixed(1)}s`, 'success');
  }

  deleteSelected() {
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.id === 'layer_captions' || layer.id === 'layer_player_widget') return;
    this.callbacks.deleteLayer?.(layer);
    this.callbacks.buildTimeline?.();
    this.callbacks.renderVideoFrame?.();
    showToast(`Deleted ${layer.name || 'clip'}`, 'info');
  }
}
