/**
 * Figma Canvas Interaction Engine
 * Centered Static 16:9 Canvas, 8 Resize Handles, Rotation, Smart Snapping Guides, Direct Selection & Arrow Nudges
 */

import { measureTextLayout } from './renderer.js';
import { BatchTransformCommand } from './history.js';
import { snapAxis, clearGuides } from './snapping.js';
import { computeResize, computeRotation } from './transform.js';
import { setupSelectionHandles, positionSelectionBox } from './selectionBox.js';
import { clientToCanvas, hitTest } from './hitTest.js';
import { handleCanvasKeyDown } from './canvasKeyShortcuts.js';

export class CanvasInteractionManager {
  constructor({ stageEl, containerEl, canvasEl, guidesEl, selectionBoxEl, scene, history, onRender, onSelectionChange }) {
    this.stageEl = stageEl;
    this.containerEl = containerEl;
    this.canvasEl = canvasEl;
    this.guidesEl = guidesEl;
    this.guidesCtx = guidesEl.getContext('2d');
    this.selectionBoxEl = selectionBoxEl;
    this.scene = scene;
    this.history = history;
    this.onRender = onRender;
    this.onSelectionChange = onSelectionChange;

    this.mode = 'idle';
    this.dragTarget = null;
    this.activeHandle = null;
    this.startPointerX = 0;
    this.startPointerY = 0;
    this.initialBounds = null;
    this.initialRotation = 0;
    this.startPointerAngle = 0;
    this.snapThreshold = 8;

    this.sizeBadgeEl = document.createElement('div');
    this.sizeBadgeEl.className = 'size-tooltip-badge hidden';
    this.tagEl = setupSelectionHandles(this.selectionBoxEl, this.sizeBadgeEl);

    this.attachEvents();
    setTimeout(() => this.updateSelectionBox(), 50);
  }

  attachEvents() {
    window.addEventListener('resize', () => this.updateSelectionBox());
    this.stageEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('keydown', (e) => handleCanvasKeyDown(e, this));
    this.selectionBoxEl.addEventListener('dblclick', () => {
      const layer = this.scene.getSelectedLayer();
      if (layer && layer.type === 'text') {
        const input = document.getElementById('layer-content-input');
        if (input) { input.focus(); input.select(); }
      }
    });
  }

  fitToScreen() {
    this.updateSelectionBox();
  }

  clientToCanvas(clientX, clientY) {
    return clientToCanvas(clientX, clientY, this.canvasEl, this.scene);
  }

  hitTest(canvasX, canvasY) {
    return hitTest(canvasX, canvasY, this.scene);
  }

  onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.classList.contains('handle')) {
      e.stopPropagation();
      this.startResize(e.target.dataset.handle, e);
      return;
    }
    if (e.target.classList.contains('rotate-zone')) {
      e.stopPropagation();
      this.startRotate(e);
      return;
    }
    if (e.target.closest('#figma-selection-box')) {
      e.stopPropagation();
      this.startMove(this.scene.getSelectedLayer(), e);
      return;
    }

    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    const hit = this.hitTest(x, y);
    if (hit) {
      this.scene.selectLayer(hit.id, e.shiftKey);
      this.startMove(hit, e);
    } else if (!e.shiftKey) {
      this.scene.selectLayer(null);
    }
    this.updateSelectionBox();
    this.onRender();
    this.onSelectionChange?.(this.scene.getSelectedLayer());
  }

  startMove(layer, e) {
    if (!layer || layer.locked) return;
    this.mode = 'moving';
    this.dragTarget = layer;
    this.startPointerX = e.clientX;
    this.startPointerY = e.clientY;
    this.initialBounds = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    clearGuides(this.guidesCtx);
  }

  startResize(handle, e) {
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.locked) return;
    this.mode = 'resizing';
    this.activeHandle = handle;
    this.dragTarget = layer;
    this.startPointerX = e.clientX;
    this.startPointerY = e.clientY;
    this.initialBounds = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    this.sizeBadgeEl.classList.remove('hidden');
    this.sizeBadgeEl.textContent = `${Math.round(layer.width)} × ${Math.round(layer.height)}`;
  }

  startRotate(e) {
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.locked) return;
    this.mode = 'rotating';
    this.dragTarget = layer;
    this.initialRotation = layer.rotation || 0;
    const rect = this.canvasEl.getBoundingClientRect();
    const cx = rect.left + ((layer.x + layer.width / 2) / 1920) * rect.width;
    const cy = rect.top + ((layer.y + layer.height / 2) / 1080) * rect.height;
    this.startPointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
  }

  onMouseMove(e) {
    if (!this.dragTarget) return;
    const rect = this.canvasEl.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    if (this.mode === 'moving') {
      const deltaX = ((e.clientX - this.startPointerX) / rect.width) * 1920;
      const deltaY = ((e.clientY - this.startPointerY) / rect.height) * 1080;
      let newX = this.initialBounds.x + deltaX;
      let newY = this.initialBounds.y + deltaY;

      if (!e.ctrlKey && !e.metaKey) {
        newX = snapAxis(newX, this.initialBounds.width, 'x', this.scene, this.dragTarget, this.snapThreshold, this.guidesCtx);
        newY = snapAxis(newY, this.initialBounds.height, 'y', this.scene, this.dragTarget, this.snapThreshold, this.guidesCtx);
      } else {
        clearGuides(this.guidesCtx);
      }
      this.dragTarget.x = Math.round(newX);
      this.dragTarget.y = Math.round(newY);
      if (typeof this.dragTarget.anchorCenterY === 'number') {
        this.dragTarget.anchorCenterY = this.dragTarget.y + (this.dragTarget.height || 400) / 2;
      }
    } else if (this.mode === 'resizing') {
      const deltaX = ((e.clientX - this.startPointerX) / rect.width) * 1920;
      const deltaY = ((e.clientY - this.startPointerY) / rect.height) * 1080;
      const resized = computeResize({
        initialBounds: this.initialBounds,
        handle: this.activeHandle,
        deltaX, deltaY,
        shiftKey: e.shiftKey,
        altKey: e.altKey
      });
      Object.assign(this.dragTarget, resized);
      this.dragTarget.anchorCenterY = this.dragTarget.y + (this.dragTarget.height || 400) / 2;
      if (this.dragTarget.type === 'text' || this.dragTarget.type === 'transcription') {
        measureTextLayout(this.canvasEl.getContext('2d'), this.dragTarget);
      }
      this.sizeBadgeEl.textContent = `${Math.round(this.dragTarget.width)} × ${Math.round(this.dragTarget.height)}`;
    } else if (this.mode === 'rotating') {
      this.dragTarget.rotation = computeRotation({
        layer: this.dragTarget, rect, clientX: e.clientX, clientY: e.clientY,
        initialRotation: this.initialRotation, startPointerAngle: this.startPointerAngle,
        shiftKey: e.shiftKey
      });
    }

    this.updateSelectionBox();
    this.onRender();
    this.onSelectionChange?.(this.dragTarget);
  }

  onMouseUp() {
    if (this.dragTarget && ['moving', 'resizing', 'rotating'].includes(this.mode)) {
      const layer = this.dragTarget;
      const oldB = this.initialBounds;
      const newB = { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation };
      if (oldB.x !== newB.x || oldB.y !== newB.y || oldB.width !== newB.width || oldB.height !== newB.height || this.initialRotation !== newB.rotation) {
        this.history.execute(new BatchTransformCommand([{
          layer,
          oldBounds: { ...oldB, rotation: this.initialRotation },
          newBounds: newB
        }], () => {
          this.updateSelectionBox();
          this.onRender();
        }));
      }
    }
    this.mode = 'idle';
    this.dragTarget = null;
    this.sizeBadgeEl.classList.add('hidden');
    clearGuides(this.guidesCtx);
  }

  updateSelectionBox() {
    positionSelectionBox(this.selectionBoxEl, this.tagEl, this.scene);
  }
}
