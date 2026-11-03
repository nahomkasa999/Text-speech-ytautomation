/**
 * Figma Canvas Interaction Engine
 * Viewport Zoom & Pan, 8 Resize Handles, Rotation, Smart Snapping Guides, Inline Text Editing, Arrow Nudges
 */

import { measureTextLayout } from './renderer.js';
import { BatchTransformCommand, PropertyChangeCommand } from './history.js';

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

    // Viewport State
    this.zoom = 0.5;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.spacePressed = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // Interaction State
    this.mode = 'idle'; // 'idle' | 'moving' | 'resizing' | 'rotating' | 'marquee' | 'editing_text'
    this.dragTarget = null;
    this.activeHandle = null;
    this.startPointerX = 0;
    this.startPointerY = 0;
    this.initialBounds = null;
    this.initialRotation = 0;

    // Snapping Guides
    this.snapThreshold = 8;
    this.activeGuides = []; // array of { type: 'h'|'v', pos: number }

    // Floating Size Tooltip
    this.sizeBadgeEl = document.createElement('div');
    this.sizeBadgeEl.className = 'size-tooltip-badge hidden';
    this.selectionBoxEl.appendChild(this.sizeBadgeEl);

    // Setup 8 Handles & 4 Rotation Zones
    this.setupHandles();

    // Event Listeners
    this.attachEvents();
    
    // Fit canvas initially
    setTimeout(() => this.fitToScreen(), 50);
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
    // Window Resize -> auto refit
    window.addEventListener('resize', () => this.fitToScreen());

    // Wheel Zoom (Ctrl+Wheel or Trackpad Pinch)
    this.stageEl.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Pointer Down
    this.stageEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Keyboard Shortcuts (Space pan, Arrow nudges, Esc, Zoom)
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Double click to inline edit text
    this.selectionBoxEl.addEventListener('dblclick', (e) => this.onDoubleClick(e));

    // Zoom Select Dropdown
    const zoomSelect = document.getElementById('zoom-select');
    if (zoomSelect) {
      zoomSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'fit') this.fitToScreen();
        else if (val === '100%') this.zoom100();
        else {
          const num = parseInt(val) / 100;
          if (num > 0) {
            this.zoom = num;
            const stageRect = this.stageEl.getBoundingClientRect();
            const canvasW = this.scene.canvas.width || 1920;
            const canvasH = this.scene.canvas.height || 1080;
            this.panX = (stageRect.width - canvasW * this.zoom) / 2;
            this.panY = (stageRect.height - canvasH * this.zoom) / 2;
            this.applyTransform();
          }
        }
      });
    }
  }

  applyTransform() {
    this.containerEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.updateSelectionBox();
  }

  fitToScreen() {
    const stageRect = this.stageEl.getBoundingClientRect();
    if (stageRect.width === 0 || stageRect.height === 0) return;

    const margin = 48;
    const availW = Math.max(200, stageRect.width - margin);
    const availH = Math.max(200, stageRect.height - margin);

    const canvasW = this.scene.canvas.width || 1920;
    const canvasH = this.scene.canvas.height || 1080;

    this.zoom = Math.min(availW / canvasW, availH / canvasH);
    this.panX = (stageRect.width - canvasW * this.zoom) / 2;
    this.panY = (stageRect.height - canvasH * this.zoom) / 2;

    this.applyTransform();
    this.updateZoomDisplay();
  }

  zoom100() {
    const stageRect = this.stageEl.getBoundingClientRect();
    const canvasW = this.scene.canvas.width || 1920;
    const canvasH = this.scene.canvas.height || 1080;

    this.zoom = 1.0;
    this.panX = (stageRect.width - canvasW) / 2;
    this.panY = (stageRect.height - canvasH) / 2;

    this.applyTransform();
    this.updateZoomDisplay();
  }

  zoomAt(factor, clientX, clientY) {
    const stageRect = this.stageEl.getBoundingClientRect();
    const mouseX = clientX - stageRect.left;
    const mouseY = clientY - stageRect.top;

    const newZoom = Math.max(0.1, Math.min(3.0, this.zoom * factor));
    const zoomRatio = newZoom / this.zoom;

    this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
    this.panY = mouseY - (mouseY - this.panY) * zoomRatio;
    this.zoom = newZoom;

    this.applyTransform();
    this.updateZoomDisplay();
  }

  updateZoomDisplay() {
    const zoomSelect = document.getElementById('zoom-select');
    if (zoomSelect) {
      zoomSelect.value = `${Math.round(this.zoom * 100)}%`;
    }
  }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom centered at mouse cursor
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      this.zoomAt(factor, e.clientX, e.clientY);
    } else {
      // Pan
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
      this.applyTransform();
    }
  }

  clientToCanvas(clientX, clientY) {
    const containerRect = this.containerEl.getBoundingClientRect();
    return {
      x: (clientX - containerRect.left) / this.zoom,
      y: (clientY - containerRect.top) / this.zoom
    };
  }

  hitTest(canvasX, canvasY) {
    // Top-to-bottom search (reverse layer order)
    for (let i = this.scene.layers.length - 1; i >= 0; i--) {
      const layer = this.scene.layers[i];
      if (!layer.visible || layer.locked) continue;

      // Handle layer rotation in hit test
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

      if (px >= layer.x && px <= layer.x + layer.width && py >= layer.y && py <= layer.y + layer.height) {
        return layer;
      }
    }
    return null;
  }

  onMouseDown(e) {
    if (e.button !== 0 && e.button !== 1) return; // Only Left / Middle

    // Middle Mouse or Space held -> Pan Mode
    if (e.button === 1 || this.spacePressed) {
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
      this.stageEl.style.cursor = 'grabbing';
      return;
    }

    // Check if clicked on Handle
    if (e.target.classList.contains('handle')) {
      e.stopPropagation();
      this.startResize(e.target.dataset.handle, e);
      return;
    }

    // Check if clicked on Rotation Zone
    if (e.target.classList.contains('rotate-zone')) {
      e.stopPropagation();
      this.startRotate(e);
      return;
    }

    // Check if clicked on existing selection box
    if (e.target.closest('#figma-selection-box')) {
      e.stopPropagation();
      this.startMove(this.scene.getSelectedLayer(), e);
      return;
    }

    // Hit test canvas layers
    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    const hit = this.hitTest(x, y);

    if (hit) {
      this.scene.selectLayer(hit.id, e.shiftKey);
      this.startMove(hit, e);
    } else {
      // Clicked on empty space -> Deselect or Marquee
      if (!e.shiftKey) {
        this.scene.selectLayer(null);
      }
      this.startMarquee(e);
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
    this.activeGuides = [];
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
  }

  startRotate(e) {
    const layer = this.scene.getSelectedLayer();
    if (!layer || layer.locked) return;
    this.mode = 'rotating';
    this.dragTarget = layer;
    this.initialRotation = layer.rotation || 0;
    
    const containerRect = this.containerEl.getBoundingClientRect();
    const cx = containerRect.left + (layer.x + layer.width / 2) * this.zoom;
    const cy = containerRect.top + (layer.y + layer.height / 2) * this.zoom;
    this.startPointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
  }

  startMarquee(e) {
    this.mode = 'marquee';
    this.startPointerX = e.clientX;
    this.startPointerY = e.clientY;
  }

  onMouseMove(e) {
    if (this.isPanning) {
      this.panX = e.clientX - this.panStartX;
      this.panY = e.clientY - this.panStartY;
      this.applyTransform();
      return;
    }

    if (this.mode === 'moving' && this.dragTarget) {
      const deltaX = (e.clientX - this.startPointerX) / this.zoom;
      const deltaY = (e.clientY - this.startPointerY) / this.zoom;

      let newX = this.initialBounds.x + deltaX;
      let newY = this.initialBounds.y + deltaY;

      // Smart Snapping (disable with Ctrl)
      if (!e.ctrlKey) {
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
      const containerRect = this.containerEl.getBoundingClientRect();
      const cx = containerRect.left + (this.dragTarget.x + this.dragTarget.width / 2) * this.zoom;
      const cy = containerRect.top + (this.dragTarget.y + this.dragTarget.height / 2) * this.zoom;
      const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      let deg = this.initialRotation + ((currentAngle - this.startPointerAngle) * 180) / Math.PI;

      // Shift snaps to 15 degrees
      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }
      this.dragTarget.rotation = Math.round(deg) % 360;

      this.updateSelectionBox();
      this.onRender();
      return;
    }
  }

  handleResizeMove(e) {
    const deltaX = (e.clientX - this.startPointerX) / this.zoom;
    const deltaY = (e.clientY - this.startPointerY) / this.zoom;
    const { x, y, width, height } = this.initialBounds;
    const handle = this.activeHandle;
    const layer = this.dragTarget;
    const minSize = 20;

    let newX = x;
    let newY = y;
    let newW = width;
    let newH = height;

    // Horizontal adjustments
    if (handle.includes('e')) newW = Math.max(minSize, width + deltaX);
    if (handle.includes('w')) {
      newW = Math.max(minSize, width - deltaX);
      newX = x + (width - newW);
    }

    // Vertical adjustments
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
    const canvasLimit = axis === 'x' ? this.scene.canvas.width : this.scene.canvas.height;
    const canvasCenter = canvasLimit / 2;
    const valCenter = val + size / 2;
    const valEnd = val + size;

    // Target reference points to snap to: 0, center, canvas limit
    const targets = [0, canvasCenter, canvasLimit];

    // Also include other layers' edges and centers
    this.scene.layers.forEach(l => {
      if (l.id === this.dragTarget?.id || !l.visible) return;
      const lPos = axis === 'x' ? l.x : l.y;
      const lSize = axis === 'x' ? l.width : l.height;
      targets.push(lPos, lPos + lSize / 2, lPos + lSize);
    });

    for (const target of targets) {
      // Snap Start
      if (Math.abs(val - target) < this.snapThreshold) {
        this.drawGuideLine(axis, target);
        return target;
      }
      // Snap Center
      if (Math.abs(valCenter - target) < this.snapThreshold) {
        this.drawGuideLine(axis, target);
        return target - size / 2;
      }
      // Snap End
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
    this.guidesCtx.strokeStyle = '#F24822'; // Red snapping line
    this.guidesCtx.lineWidth = 1;
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
    if (this.isPanning) {
      this.isPanning = false;
      this.stageEl.style.cursor = this.spacePressed ? 'grab' : 'default';
    }

    if ((this.mode === 'moving' || this.mode === 'resizing' || this.mode === 'rotating') && this.dragTarget) {
      const layer = this.dragTarget;
      const oldB = this.initialBounds;
      const newB = { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation };

      // Commit to Undo History
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

    this.selectionBoxEl.classList.remove('hidden');
    this.selectionBoxEl.style.left = `${layer.x}px`;
    this.selectionBoxEl.style.top = `${layer.y}px`;
    this.selectionBoxEl.style.width = `${layer.width}px`;
    this.selectionBoxEl.style.height = `${layer.height}px`;

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

    // Zoom Shortcuts (Ctrl+0, Ctrl+1, Ctrl+=, Ctrl+-)
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'Digit0' || e.key === '0') {
        e.preventDefault();
        this.fitToScreen();
        return;
      }
      if (e.code === 'Digit1' || e.key === '1') {
        e.preventDefault();
        this.zoom100();
        return;
      }
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        this.zoomAt(1.15, window.innerWidth / 2, window.innerHeight / 2);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        this.zoomAt(0.85, window.innerWidth / 2, window.innerHeight / 2);
        return;
      }
    }

    // Space Pan Key
    if (e.code === 'Space' && !this.spacePressed) {
      this.spacePressed = true;
      this.stageEl.style.cursor = 'grab';
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

  onKeyUp(e) {
    if (e.code === 'Space') {
      this.spacePressed = false;
      this.stageEl.style.cursor = 'default';
    }
  }

  onDoubleClick(e) {
    const layer = this.scene.getSelectedLayer();
    if (!layer || (layer.type !== 'text' && layer.type !== 'transcription')) return;

    // Inline Text Editing
    this.mode = 'editing_text';
    const textarea = document.createElement('textarea');
    textarea.className = 'inline-text-editor';
    textarea.value = layer.text;
    textarea.style.left = `${layer.x}px`;
    textarea.style.top = `${layer.y}px`;
    textarea.style.width = `${layer.width}px`;
    textarea.style.height = `${layer.height}px`;
    textarea.style.font = `${layer.fontWeight || '700'} ${layer.fontSize || 48}px ${layer.fontFamily || "'Merriweather', serif"}`;
    textarea.style.color = layer.fill || '#FFFFFF';
    textarea.style.textAlign = layer.align || 'left';

    this.containerEl.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const commit = () => {
      if (textarea.parentNode) {
        const newText = textarea.value;
        const oldText = layer.text;
        textarea.parentNode.removeChild(textarea);
        this.mode = 'idle';

        if (newText !== oldText) {
          layer.text = newText;
          const ctx = this.canvasEl.getContext('2d');
          measureTextLayout(ctx, layer);
          this.history.execute(new PropertyChangeCommand(layer, 'text', oldText, newText, () => {
            this.updateSelectionBox();
            this.onRender();
          }));
        }
        this.updateSelectionBox();
        this.onRender();
        this.onSelectionChange?.(layer);
      }
    };

    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        commit();
      }
    });
  }
}
