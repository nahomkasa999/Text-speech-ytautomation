/**
 * Canvas keyboard navigation and layer shortcuts (Delete, Arrow nudges, Esc).
 */

import { PropertyChangeCommand, RemoveLayerCommand } from './history.js';

export function handleCanvasKeyDown(e, manager) {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    const layer = manager.scene.getSelectedLayer();
    if (!layer || ['transcription', 'audio_widget'].includes(layer.type) || ['layer_captions', 'layer_player_widget'].includes(layer.id)) return;
    e.preventDefault();
    const removedId = layer.id;
    manager.history.execute(new RemoveLayerCommand(manager.scene, layer, () => {
      manager.scene.selectLayer('layer_captions');
      manager.updateSelectionBox();
      manager.onRender();
      manager.onSelectionChange?.(manager.scene.getSelectedLayer());
    }));
    manager.scene.removeLayer(removedId);
    manager.scene.selectLayer('layer_captions');
    manager.updateSelectionBox();
    manager.onRender();
    manager.onSelectionChange?.(manager.scene.getSelectedLayer());
    return;
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const layer = manager.scene.getSelectedLayer();
    if (layer && !layer.locked) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const oldX = layer.x, oldY = layer.y;
      if (e.key === 'ArrowUp') layer.y -= step;
      if (e.key === 'ArrowDown') layer.y += step;
      if (e.key === 'ArrowLeft') layer.x -= step;
      if (e.key === 'ArrowRight') layer.x += step;
      manager.history.execute(new PropertyChangeCommand(layer, 'x', oldX, layer.x));
      manager.updateSelectionBox();
      manager.onRender();
      manager.onSelectionChange?.(layer);
    }
  }

  if (e.key === 'Escape') {
    manager.scene.selectLayer(null);
    manager.updateSelectionBox();
    manager.onRender();
    manager.onSelectionChange?.(null);
  }
}
