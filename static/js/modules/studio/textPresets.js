/**
 * Text and Title Presets: Add Headings, Subtitles, and Titles.
 */

import { measureTextLayout } from '../../video/renderer.js';
import { showToast } from '../ui/toast.js';

export class TextPresetsManager {
  constructor({ scene, el, canvasCtx, interactionMgr, callbacks }) {
    this.scene = scene;
    this.el = el;
    this.canvasCtx = canvasCtx;
    this.interactionMgr = interactionMgr;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  attachEvents() {
    const btnHeading = document.getElementById('btn-add-heading');
    const btnSubtitle = document.getElementById('btn-add-subtitle');

    if (btnHeading) btnHeading.addEventListener('click', () => this.addTitle('HEADING'));
    if (btnSubtitle) btnSubtitle.addEventListener('click', () => this.addSubtitle('Subtitle text'));
  }

  addTitle(text = 'MAIN TITLE') {
    const layer = {
      id: `title_${Date.now()}`,
      type: 'text',
      name: 'Main Title',
      text,
      x: 260,
      y: 180,
      width: 1400,
      height: 140,
      fontSize: 76,
      fontFamily: 'Inter',
      fontWeight: '800',
      fill: '#FFFFFF',
      align: 'center',
      verticalAlign: 'middle',
      casing: 'uppercase',
      shadowColor: 'rgba(0,0,0,0.85)',
      shadowBlur: 16,
      opacity: 1,
      visible: true,
      startTime: 0,
      endTime: this.el.videoAudioPlayer.duration || 10,
      fadeIn: 0.5,
      fadeOut: 0.5
    };

    measureTextLayout(this.canvasCtx, layer);
    this.scene.addLayer(layer);
    this.scene.selectLayer(layer.id);
    this.callbacks.renderLayersList?.();
    this.callbacks.renderVideoFrame?.();
    this.interactionMgr.updateSelectionBox();
    this.callbacks.saveDraft?.();
    showToast('Added Heading layer', 'success');
  }

  addSubtitle(text = 'Enter subtitle text here...') {
    const layer = {
      id: `sub_${Date.now()}`,
      type: 'text',
      name: 'Subtitle',
      text,
      x: 360,
      y: 340,
      width: 1200,
      height: 90,
      fontSize: 42,
      fontFamily: 'Inter',
      fontWeight: '600',
      fill: '#E2E8F0',
      align: 'center',
      verticalAlign: 'middle',
      casing: 'none',
      opacity: 1,
      visible: true,
      startTime: 0,
      endTime: this.el.videoAudioPlayer.duration || 10,
      fadeIn: 0.4,
      fadeOut: 0.4
    };

    measureTextLayout(this.canvasCtx, layer);
    this.scene.addLayer(layer);
    this.scene.selectLayer(layer.id);
    this.callbacks.renderLayersList?.();
    this.callbacks.renderVideoFrame?.();
    this.interactionMgr.updateSelectionBox();
    this.callbacks.saveDraft?.();
    showToast('Added Subtitle layer', 'success');
  }
}
