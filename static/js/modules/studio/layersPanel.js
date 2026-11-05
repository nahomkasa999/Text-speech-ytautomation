/**
 * Studio Layers Panel Management: list rendering, layer addition, deletion, and restore.
 */

import { TextLayer, TranscriptionLayer } from '../../video/scene.js';
import { AddLayerCommand, RemoveLayerCommand } from '../../video/history.js';
import { showToast } from '../ui/toast.js';

export class LayersPanel {
  constructor({ el, scene, history, callbacks }) {
    this.el = el;
    this.scene = scene;
    this.history = history;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  render() {
    this.el.layersList.innerHTML = '';
    const selected = this.scene.getSelectedLayer();

    this.scene.layers.forEach(l => {
      const item = document.createElement('div');
      item.className = `layer-item ${selected && selected.id === l.id ? 'active' : ''}`;
      const icon = l.type === 'transcription' ? 'T' : (l.type === 'audio_widget' ? 'P' : 'T');
      const isCustom = l.id !== 'layer_captions' && l.id !== 'layer_player_widget' && l.type !== 'transcription';

      const deleteBtnHtml = isCustom
        ? `<button class="layer-item-delete" title="Delete layer">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           </button>`
        : '';

      const displayName = l.text ? (l.text.length > 18 ? l.text.slice(0, 18) + '...' : l.text) : (l.name || 'Layer');
      item.innerHTML = `
        <span style="font-weight:700; opacity:0.6; font-size:11px;">${icon}</span>
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</span>
        ${deleteBtnHtml}
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.layer-item-delete')) {
          e.stopPropagation();
          this.deleteLayer(l);
          return;
        }
        this.callbacks.selectLayer(l.id);
      });
      this.el.layersList.appendChild(item);
    });

    const hasCaptions = !!this.scene.getLayer('layer_captions');
    if (this.el.btnInspectorRestoreCaptions) {
      this.el.btnInspectorRestoreCaptions.style.display = hasCaptions ? 'none' : 'flex';
    }
  }

  deleteLayer(layer) {
    if (layer.id === 'layer_captions' || layer.id === 'layer_player_widget' || layer.type === 'transcription') return;
    this.history.execute(new RemoveLayerCommand(this.scene, layer, () => {
      this.callbacks.selectLayer('layer_captions');
    }));
    this.scene.removeLayer(layer.id);
    this.callbacks.selectLayer('layer_captions');
    this.render();
    this.callbacks.syncInspector();
    this.callbacks.renderVideoFrame();
    this.callbacks.debouncedSaveDraft();
    showToast('Layer deleted', 'info');
  }

  ensureOrRestoreCaptions() {
    let capLayer = this.scene.getLayer('layer_captions');
    if (!capLayer) {
      const activeText = (this.callbacks.getActiveText?.() || '').slice(0, 140);
      capLayer = new TranscriptionLayer({
        id: 'layer_captions',
        name: 'Synced Captions',
        x: 880, y: 240, width: 920, fontSize: 54, fill: '#111827', align: 'left',
        text: activeText, startTime: 0, endTime: 999999
      });
      this.scene.addLayer(capLayer);
      showToast('Synced Captions restored', 'success');
    } else {
      capLayer.visible = true;
      capLayer.endTime = 999999;
      showToast('Synced Captions selected', 'info');
    }
    this.callbacks.selectLayer('layer_captions');
    this.render();
    this.callbacks.syncInspector();
    this.callbacks.renderVideoFrame();
    this.callbacks.debouncedSaveDraft();
  }

  attachEvents() {
    if (this.el.btnRestoreCaptions) {
      this.el.btnRestoreCaptions.addEventListener('click', () => this.ensureOrRestoreCaptions());
    }
    if (this.el.btnInspectorRestoreCaptions) {
      this.el.btnInspectorRestoreCaptions.addEventListener('click', () => this.ensureOrRestoreCaptions());
    }

    this.el.btnAddTextLayer.addEventListener('click', () => {
      const count = this.scene.layers.filter(l => l.type === 'text').length + 1;
      const newId = `layer_text_${Date.now()}`;
      const newLayer = new TextLayer({
        id: newId, name: `Text ${count}`, text: 'Subtitle Heading',
        x: 880, y: 380, width: 850, height: 80,
        fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: '700',
        fill: '#111827', align: 'left'
      });
      this.scene.addLayer(newLayer);
      this.history.execute(new AddLayerCommand(this.scene, newLayer, () => {
        this.callbacks.selectLayer(newId);
      }));
      this.callbacks.selectLayer(newId);

      setTimeout(() => {
        if (this.el.layerContentInput) {
          this.el.layerContentInput.focus();
          this.el.layerContentInput.select();
        }
      }, 60);

      this.callbacks.debouncedSaveDraft();
    });
  }
}
