/**
 * Inspector Event Listeners: reacts to user input changes in the right sidebar.
 */

import { measureTextLayout } from '../../../video/renderer.js';
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
}
