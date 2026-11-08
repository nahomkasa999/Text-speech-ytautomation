/**
 * Inspector Event Listeners: reacts to user input changes in the right sidebar.
 */

import { measureTextLayout } from '../../../video/renderer.js';
import { setupWaveColorControls, syncWaveColorControls } from './waveColors.js';
import { showToast } from '../../ui/toast.js';

function setupLayerTransformEvents(el, scene, canvasCtx, interactionMgr, callbacks) {
  const getSelected = () => scene.getSelectedLayer();

  el.btnDeleteLayer.addEventListener('click', () => {
    const l = getSelected();
    if (l && l.id !== 'layer_captions' && l.id !== 'layer_player_widget' && l.type !== 'transcription') {
      callbacks.deleteLayer(l);
    }
  });

  el.layerContentInput.addEventListener('input', (e) => {
    const l = getSelected();
    if (l && l.type === 'text') {
      l.text = e.target.value;
      l.name = e.target.value.slice(0, 15) || 'Text Layer';
      measureTextLayout(canvasCtx, l);
      callbacks.renderLayersList();
      interactionMgr.updateSelectionBox();
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });

  el.propPosX.addEventListener('input', (e) => {
    const l = getSelected();
    if (l) {
      l.x = parseInt(e.target.value) || 0;
      interactionMgr.updateSelectionBox();
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });

  el.propPosY.addEventListener('input', (e) => {
    const l = getSelected();
    if (l) {
      l.y = parseInt(e.target.value) || 0;
      l.anchorCenterY = l.y + (l.height || 400) / 2;
      interactionMgr.updateSelectionBox();
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });

  el.propSizeW.addEventListener('input', (e) => {
    const l = getSelected();
    if (l) {
      l.width = Math.max(50, Math.min(1920, parseInt(e.target.value) || 200));
      if (l.type === 'text' || l.type === 'transcription') measureTextLayout(canvasCtx, l);
      interactionMgr.updateSelectionBox();
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });

  if (el.propSizeH) {
    el.propSizeH.addEventListener('input', (e) => {
      const l = getSelected();
      if (l) {
        l.height = Math.max(20, Math.min(1080, parseInt(e.target.value) || 40));
        l.anchorCenterY = l.y + l.height / 2;
        interactionMgr.updateSelectionBox();
        callbacks.renderVideoFrame();
        callbacks.debouncedSaveDraft();
      }
    });
  }
}

function setupTypographyEvents(el, scene, canvasCtx, interactionMgr, callbacks) {
  const getSelected = () => scene.getSelectedLayer();

  el.captionSizeNum.addEventListener('input', (e) => {
    const l = getSelected();
    if (l) {
      l.fontSize = parseInt(e.target.value) || 54;
      if (l.type === 'text' || l.type === 'transcription') measureTextLayout(canvasCtx, l);
      interactionMgr.updateSelectionBox();
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });

  el.captionFontSelect.addEventListener('change', (e) => {
    const l = getSelected();
    if (l) {
      l.fontFamily = e.target.value;
      if (l.type === 'text' || l.type === 'transcription') measureTextLayout(canvasCtx, l);
      interactionMgr.updateSelectionBox();
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });

  el.alignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelected();
      if (l) {
        el.alignBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.align = btn.dataset.align;
        callbacks.renderVideoFrame();
        callbacks.debouncedSaveDraft();
      }
    });
  });

  el.valignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelected();
      if (l) {
        el.valignBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.verticalAlign = btn.dataset.valign;
        callbacks.renderVideoFrame();
        callbacks.debouncedSaveDraft();
      }
    });
  });

  el.casingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelected();
      if (l) {
        el.casingBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.casing = btn.dataset.casing === 'normal' ? 'none' : btn.dataset.casing;
        if (l.type === 'text' || l.type === 'transcription') measureTextLayout(canvasCtx, l);
        interactionMgr.updateSelectionBox();
        callbacks.renderVideoFrame();
        callbacks.debouncedSaveDraft();
      }
    });
  });

  el.weightBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelected();
      if (l) {
        el.weightBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.fontWeight = btn.dataset.weight;
        if (l.type === 'text' || l.type === 'transcription') measureTextLayout(canvasCtx, l);
        interactionMgr.updateSelectionBox();
        callbacks.renderVideoFrame();
        callbacks.debouncedSaveDraft();
      }
    });
  });
}

function setupWidgetAndColorEvents(el, scene, interactionMgr, callbacks) {
  const getSelected = () => scene.getSelectedLayer();

  el.captionColorPicker.addEventListener('input', (e) => {
    const l = getSelected();
    if (l) {
      l.fill = e.target.value;
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });

  el.colorPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelected();
      if (l) {
        l.fill = btn.dataset.color;
        el.captionColorPicker.value = btn.dataset.color;
        callbacks.renderVideoFrame();
        callbacks.debouncedSaveDraft();
      }
    });
  });

  el.widgetTmplBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const widget = scene.getLayer('layer_player_widget') || scene.layers.find(ly => ly.type === 'audio_widget');
      if (widget) {
        el.widgetTmplBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        widget.widgetStyle = btn.dataset.style;
        // First time picking "Gold glow" on the default dark colour: start with
        // the gold + glow look from the reference clip.
        if (btn.dataset.style === 'ambient_shimmer' && (!widget.color || widget.color.toLowerCase() === '#111827')) {
          widget.color = '#E8B64C';
          widget.autoPalette = true;
          if (!widget.glow) widget.glow = 0.6;
        }
        syncWaveColorControls(scene);
        // Ambient animations draw in a band of the layer's height; the default
        // layer height (200px) is too tall, so start them at a calmer 100px.
        if (btn.dataset.style.startsWith('ambient_') && (!widget.height || widget.height >= 200)) {
          widget.height = 100;
        }
        interactionMgr?.updateSelectionBox();
        callbacks.renderVideoFrame();
        callbacks.debouncedSaveDraft();
      }
    });
  });

  // Size slider: scales the wave animation up/down around its centre.
  document.getElementById('widget-size-slider')?.addEventListener('input', (e) => {
    const widget = scene.getLayer('layer_player_widget') || scene.layers.find(ly => ly.type === 'audio_widget');
    if (!widget) return;
    const CANVAS_W = scene.canvas?.width || 1920;
    const CANVAS_H = scene.canvas?.height || 1080;
    const newH = Number(e.target.value);
    const oldH = widget.height || 100;
    // Width at 100% size. Re-derived from the current shape unless the width is
    // already capped at the frame edge, so dragged shapes keep their proportions.
    if (!widget.baseWidth || widget.width < CANVAS_W - 1) widget.baseWidth = (widget.width * 100) / oldH;
    const cx = widget.x + widget.width / 2;
    const cy = widget.y + oldH / 2;
    // Grow freely in height; width stops at the frame so the wave stays visible.
    widget.width = Math.max(40, Math.min(CANVAS_W, Math.round(widget.baseWidth * newH / 100)));
    widget.height = newH;
    widget.x = Math.round(Math.min(Math.max(cx - widget.width / 2, 0), CANVAS_W - widget.width));
    // Keep the whole wave inside the frame (centred if it is taller than the frame).
    widget.y = Math.round(newH <= CANVAS_H
      ? Math.min(Math.max(cy - newH / 2, 0), CANVAS_H - newH)
      : (CANVAS_H - newH) / 2);
    const label = document.getElementById('widget-size-val');
    if (label) label.textContent = `${newH}%`;
    if (el.propPosX) { el.propPosX.value = widget.x; el.propPosY.value = widget.y; el.propSizeW.value = widget.width; }
    if (el.propSizeH) el.propSizeH.value = widget.height;
    interactionMgr?.updateSelectionBox();
    callbacks.renderVideoFrame();
    callbacks.debouncedSaveDraft();
  });

  document.getElementById('toggle-widget-sync')?.addEventListener('change', (e) => {
    const widget = scene.getLayer('layer_player_widget') || scene.layers.find(ly => ly.type === 'audio_widget');
    if (!widget) return;
    widget.syncToVoice = e.target.checked;
    callbacks.renderVideoFrame();
    callbacks.debouncedSaveDraft();
  });

  el.togglePlayerWidget.addEventListener('change', (e) => {
    const widgetLayer = scene.getLayer('layer_player_widget');
    if (widgetLayer) {
      widgetLayer.visible = e.target.checked;
      callbacks.renderVideoFrame();
      callbacks.debouncedSaveDraft();
    }
  });
}

export function setupInspectorEvents({ el, scene, canvasCtx, interactionMgr, callbacks }) {
  setupLayerTransformEvents(el, scene, canvasCtx, interactionMgr, callbacks);
  setupTypographyEvents(el, scene, canvasCtx, interactionMgr, callbacks);
  setupWidgetAndColorEvents(el, scene, interactionMgr, callbacks);
  setupWaveColorControls({ scene, callbacks });
}
