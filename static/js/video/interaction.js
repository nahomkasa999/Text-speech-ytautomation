/**
 * Figma Canvas Interaction Engine
 * Centered Static 16:9 Canvas, 8 Resize Handles, Rotation, Smart Snapping Guides, Direct Selection & Arrow Nudges
 */

import { measureTextLayout } from './renderer.js';
import { BatchTransformCommand, PropertyChangeCommand, RemoveLayerCommand } from './history.js';

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

    // Interaction State
    this.mode = 'idle'; // 'idle' | 'moving' | 'resizing' | 'rotating'
    this.dragTarget = null;
    this.activeHandle = null;
    this.startPointerX = 0;
    this.startPointerY = 0;
    this.initialBounds = null;
    this.initialRotation = 0;
    this.startPointerAngle = 0;

    // Snapping Guides
    this.snapThreshold = 8;

    // Floating Size Tooltip
    this.sizeBadgeEl = document.createElement('div');
    this.sizeBadgeEl.className = 'size-tooltip-badge hidden';

    // Setup 8 Handles & 4 Rotation Zones
    this.setupHandles();

    // Event Listeners
    this.attachEvents();

    // Initial sync
    setTimeout(() => this.updateSelectionBox(), 50);
  }

  setupHandles() {
    this.selectionBoxEl.innerHTML = '';

    // Selection Tag Name
    this.tagEl = document.createElement('div');
    this.tagEl.className = 'selection-tag';
    this.tagEl.textContent = 'Layer';
    this.selectionBoxEl.appendChild(this.tagEl);

    // 8 Resize Handles
    const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handlePositions.forEach(pos => {
      const h = document.createElement('div');
      h.className = `handle ${pos}`;
      h.dataset.handle = pos;
      this.selectionBoxEl.appendChild(h);
    });

    // 4 Rotation Zones (outside corners)
    const rotatePositions = ['nw', 'ne', 'se', 'sw'];
    rotatePositions.forEach(pos => {
      const r = document.createElement('div');
      r.className = `rotate-zone ${pos}`;
      r.dataset.rotate = pos;
      this.selectionBoxEl.appendChild(r);
    });

    this.selectionBoxEl.appendChild(this.sizeBadgeEl);
  }

  attachEvents() {
    // Window Resize -> auto sync selection box
    window.addEventListener('resize', () => this.updateSelectionBox());

    // Pointer Down on Stage
    this.stageEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Keyboard Shortcuts (Arrow nudges, Delete, Esc)
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    // Double click to focus inspector text input
    this.selectionBoxEl.addEventListener('dblclick', (e) => this.onDoubleClick(e));
  }

  fitToScreen() {
    this.updateSelectionBox();
  }

  clientToCanvas(clientX, clientY) {
    const rect = this.canvasEl.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * (this.scene.canvas.width || 1920),
      y: ((clientY - rect.top) / rect.height) * (this.scene.canvas.height || 1080)
    };
  }

  hitTest(canvasX, canvasY) {
    const pad = 15; // Generous hit padding for easy, reliable selection
    for (let i = this.scene.layers.length - 1; i >= 0; i--) {
      const layer = this.scene.layers[i];
      if (!layer.visible || layer.locked) continue;

      let px = canvasX;
      let py = canvasY;
      if (layer.rotation) {
        const cx = layer.x + layer.width / 2;
        const cy = layer.y + layer.height / 2;
        const rad = (-layer.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = canvasX - cx;
        const dy = canvasY - cy;
        px = cx + (dx * cos - dy * sin);
        py = cy + (dx * sin + dy * cos);
      }

      const layerH = Math.max(25, layer.height || 40);
      if (px >= layer.x - pad && px <= layer.x + layer.width + pad &&
          py >= layer.y - pad && py <= layer.y + layerH + pad) {
        return layer;
      }
    }
    return null;
  }

  onMouseDown(e) {
    if (e.button !== 0) return; // Only Left Mouse

    // 1. Check if clicked on Handle
    if (e.target.classList.contains('handle')) {
      e.stopPropagation();
      this.startResize(e.target.dataset.handle, e);
      return;
    }

    // 2. Check if clicked on Rotation Zone
    if (e.target.classList.contains('rotate-zone')) {
      e.stopPropagation();
      this.startRotate(e);
      return;
    }

    // 3. Check if clicked on existing selection box
    if (e.target.closest('#figma-selection-box')) {
      e.stopPropagation();
      this.startMove(this.scene.getSelectedLayer(), e);
      return;
    }

    // 4. Hit test canvas layers
    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    const hit = this.hitTest(x, y);

    if (hit) {
      this.scene.selectLayer(hit.id, e.shiftKey);
      this.startMove(hit, e);
    } else {
      // Clicked on empty space
      if (!e.shiftKey) {
        this.scene.selectLayer(null);
      }
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
    this.clearGuides();
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
    if (this.mode === 'moving' && this.dragTarget) {
      const rect = this.canvasEl.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      const deltaX = ((e.clientX - this.startPointerX) / rect.width) * 1920;
      const deltaY = ((e.clientY - this.startPointerY) / rect.height) * 1080;

      let newX = this.initialBounds.x + deltaX;
      let newY = this.initialBounds.y + deltaY;

      // Smart Snapping (disable with Ctrl/Cmd)
      if (!e.ctrlKey && !e.metaKey) {
        newX = this.snapAxis(newX, this.initialBounds.width, 'x');
        newY = this.snapAxis(newY, this.initialBounds.height, 'y');
      } else {
        this.clearGuides();
      }

      this.dragTarget.x = Math.round(newX);
      this.dragTarget.y = Math.round(newY);

      this.updateSelectionBox();
      this.onRender();
      this.onSelectionChange?.(this.dragTarget);
      return;
    }

    if (this.mode === 'resizing' && this.dragTarget) {
      this.handleResizeMove(e);
      return;
    }

    if (this.mode === 'rotating' && this.dragTarget) {
      const rect = this.canvasEl.getBoundingClientRect();
      const cx = rect.left + ((this.dragTarget.x + this.dragTarget.width / 2) / 1920) * rect.width;
      const cy = rect.top + ((this.dragTarget.y + this.dragTarget.height / 2) / 1080) * rect.height;
      const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      let deg = this.initialRotation + ((currentAngle - this.startPointerAngle) * 180) / Math.PI;

      // Shift snaps to 15 degrees
      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }
      this.dragTarget.rotation = Math.round(deg) % 360;

      this.updateSelectionBox();
      this.onRender();
      this.onSelectionChange?.(this.dragTarget);
      return;
    }
  }

  handleResizeMove(e) {
    const rect = this.canvasEl.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const deltaX = ((e.clientX - this.startPointerX) / rect.width) * 1920;
    const deltaY = ((e.clientY - this.startPointerY) / rect.height) * 1080;

    const { x, y, width, height } = this.initialBounds;
    const handle = this.activeHandle;
    const layer = this.dragTarget;
    const minSize = 25;

    let newX = x;
    let newY = y;
    let newW = width;
    let newH = height;

    if (handle.includes('e')) newW = Math.max(minSize, width + deltaX);
    if (handle.includes('w')) {
      newW = Math.max(minSize, width - deltaX);
      newX = x + (width - newW);
    }
    if (handle.includes('s')) newH = Math.max(minSize, height + deltaY);
    if (handle.includes('n')) {
      newH = Math.max(minSize, height - deltaY);
      newY = y + (height - newH);
    }

    // Shift -> Maintain Aspect Ratio
    if (e.shiftKey) {
      const aspect = width / height;
      if (handle === 'e' || handle === 'w') newH = newW / aspect;
      else if (handle === 'n' || handle === 's') newW = newH * aspect;
      else newH = newW / aspect;
    }

    // Alt -> Resize from Center
    if (e.altKey) {
      newX = x - (newW - width);
      newY = y - (newH - height);
      newW = width + (newW - width) * 2;
      newH = height + (newH - height) * 2;
    }

    layer.x = Math.round(newX);
    layer.y = Math.round(newY);
    layer.width = Math.round(newW);
    layer.height = Math.round(newH);

    // If text layer in auto-height mode, reflow text lines and hug height
    if (layer.type === 'text' || layer.type === 'transcription') {
      const ctx = this.canvasEl.getContext('2d');
      measureTextLayout(ctx, layer);
    }

    // Update Size Tooltip Badge
    this.sizeBadgeEl.textContent = `${Math.round(layer.width)} × ${Math.round(layer.height)}`;

    this.updateSelectionBox();
    this.onRender();
    this.onSelectionChange?.(this.dragTarget);
  }

  snapAxis(val, size, axis) {
    const canvasLimit = axis === 'x' ? 1920 : 1080;
    const canvasCenter = canvasLimit / 2;
    const valCenter = val + size / 2;
    const valEnd = val + size;

    const targets = [0, canvasCenter, canvasLimit];

    this.scene.layers.forEach(l => {
      if (l.id === this.dragTarget?.id || !l.visible) return;
      const lPos = axis === 'x' ? l.x : l.y;
      const lSize = axis === 'x' ? l.width : l.height;
      targets.push(lPos, lPos + lSize / 2, lPos + lSize);
    });

    for (const target of targets) {
      if (Math.abs(val - target) < this.snapThreshold) {
        this.drawGuideLine(axis, target);
        return target;
      }
      if (Math.abs(valCenter - target) < this.snapThreshold) {
        this.drawGuideLine(axis, target);
        return target - size / 2;
      }
      if (Math.abs(valEnd - target) < this.snapThreshold) {
        this.drawGuideLine(axis, target);
        return target - size;
      }
    }

    this.clearGuides();
    return val;
  }

  drawGuideLine(axis, pos) {
    this.guidesCtx.clearRect(0, 0, 1920, 1080);
    this.guidesCtx.save();
    this.guidesCtx.strokeStyle = '#F24822'; // Figma red snapping line
    this.guidesCtx.lineWidth = 1.5;
    this.guidesCtx.setLineDash([4, 4]);

    this.guidesCtx.beginPath();
    if (axis === 'x') {
      this.guidesCtx.moveTo(pos, 0);
      this.guidesCtx.lineTo(pos, 1080);
    } else {
      this.guidesCtx.moveTo(0, pos);
      this.guidesCtx.lineTo(1920, pos);
    }
    this.guidesCtx.stroke();
    this.guidesCtx.restore();
  }

  clearGuides() {
    this.guidesCtx.clearRect(0, 0, 1920, 1080);
  }

  onMouseUp(e) {
    if ((this.mode === 'moving' || this.mode === 'resizing' || this.mode === 'rotating') && this.dragTarget) {
      const layer = this.dragTarget;
      const oldB = this.initialBounds;
      const newB = { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation };

      // Commit to Undo History if changed
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
    this.clearGuides();
  }

  updateSelectionBox() {
    const layer = this.scene.getSelectedLayer();
    if (!layer || !layer.visible) {
      this.selectionBoxEl.classList.add('hidden');
      return;
    }

    const canvasW = this.scene.canvas.width || 1920;
    const canvasH = this.scene.canvas.height || 1080;

    this.selectionBoxEl.classList.remove('hidden');
    this.selectionBoxEl.style.left = `${(layer.x / canvasW) * 100}%`;
    this.selectionBoxEl.style.top = `${(layer.y / canvasH) * 100}%`;
    this.selectionBoxEl.style.width = `${(layer.width / canvasW) * 100}%`;
    this.selectionBoxEl.style.height = `${(Math.max(20, layer.height || 40) / canvasH) * 100}%`;

    if (layer.rotation) {
      this.selectionBoxEl.style.transform = `rotate(${layer.rotation}deg)`;
    } else {
      this.selectionBoxEl.style.transform = 'none';
    }

    this.tagEl.textContent = layer.name || 'Layer';
  }

  onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    // Delete or Backspace Key
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const layer = this.scene.getSelectedLayer();
      if (!layer || layer.type === 'transcription' || layer.id === 'layer_captions' || layer.id === 'layer_player_widget' || layer.type === 'audio_widget') {
        return; // Core Synced Captions and Player Widget can NEVER be deleted!
      }
      e.preventDefault();
      const removedId = layer.id;
      this.history.execute(new RemoveLayerCommand(this.scene, layer, () => {
        this.scene.selectLayer('layer_captions');
        this.updateSelectionBox();
        this.onRender();
        this.onSelectionChange?.(this.scene.getSelectedLayer());
      }));
      this.scene.removeLayer(removedId);
      this.scene.selectLayer('layer_captions');
      this.updateSelectionBox();
      this.onRender();
      this.onSelectionChange?.(this.scene.getSelectedLayer());
      return;
    }

    // Arrow Key Nudges
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const layer = this.scene.getSelectedLayer();
      if (layer && !layer.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const oldX = layer.x;
        const oldY = layer.y;

        if (e.key === 'ArrowUp') layer.y -= step;
        if (e.key === 'ArrowDown') layer.y += step;
        if (e.key === 'ArrowLeft') layer.x -= step;
        if (e.key === 'ArrowRight') layer.x += step;

        this.history.execute(new PropertyChangeCommand(layer, 'x', oldX, layer.x));
        this.updateSelectionBox();
        this.onRender();
        this.onSelectionChange?.(layer);
      }
    }

    // Esc Key -> Deselect
    if (e.key === 'Escape') {
      this.scene.selectLayer(null);
      this.updateSelectionBox();
      this.onRender();
      this.onSelectionChange?.(null);
    }
  }

  onDoubleClick(e) {
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.type !== 'text') return;

    // Focus inspector text content input
    const input = document.getElementById('layer-content-input');
    if (input) {
      input.focus();
      input.select();
    }
  }
}
