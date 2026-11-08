/**
 * VS Code-Style Collapsible Panels, Edge Resizers, and Zen Mode Manager
 */

import { createPanelResizers } from './resizers.js';
import { initPanelShortcuts } from './shortcuts.js';

export class PanelManager {
  constructor({ leftSidebarEl, rightSidebarEl, timelineEl, onResizeCanvas }) {
    this.leftSidebarEl = leftSidebarEl;
    this.rightSidebarEl = rightSidebarEl;
    this.timelineEl = timelineEl;
    this.onResizeCanvas = onResizeCanvas;

    const saved = this.loadLayout();
    // Smaller panels on laptop screens so the canvas, timeline and Export button fit.
    const small = window.innerWidth < 1500;
    const short = window.innerHeight < 800;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    this.leftWidth = clamp(saved.leftWidth || (small ? 224 : 256), 200, small ? 250 : 380);
    this.rightWidth = clamp(saved.rightWidth || (small ? 280 : 310), 250, small ? 310 : 440);
    this.timelineHeight = clamp(saved.timelineHeight || (short ? 186 : 210), 140, short ? 200 : 320);
    this.leftCollapsed = !!saved.leftCollapsed;
    // Only the left sidebar can be collapsed now (its toggle sits in the sidebar
    // footer). Always show the inspector and timeline, even if an older version
    // saved them as hidden, since they no longer have toggle buttons.
    this.rightCollapsed = false;
    this.timelineCollapsed = false;
    this.isZenMode = false;

    createPanelResizers(this);
    this.applyLayout();
    initPanelShortcuts(this);
  }

  loadLayout() {
    try {
      const str = localStorage.getItem('book_narrator_studio_layout');
      return str ? JSON.parse(str) : {};
    } catch (e) {
      return {};
    }
  }

  saveLayout() {
    try {
      localStorage.setItem('book_narrator_studio_layout', JSON.stringify({
        leftWidth: this.leftWidth,
        rightWidth: this.rightWidth,
        timelineHeight: this.timelineHeight,
        leftCollapsed: this.leftCollapsed,
        rightCollapsed: this.rightCollapsed,
        timelineCollapsed: this.timelineCollapsed
      }));
    } catch (e) {}
  }

  applyLayout() {
    if (this.leftSidebarEl) {
      this.leftSidebarEl.classList.toggle('collapsed', this.leftCollapsed);
      this.leftSidebarEl.style.width = this.leftCollapsed ? '' : `${this.leftWidth}px`;
      if (this.resizerLeft) this.resizerLeft.style.display = this.leftCollapsed ? 'none' : 'block';
    }

    if (this.rightSidebarEl) {
      this.rightSidebarEl.classList.toggle('collapsed', this.rightCollapsed);
      this.rightSidebarEl.style.width = this.rightCollapsed ? '' : `${this.rightWidth}px`;
      if (this.resizerRight) this.resizerRight.style.display = this.rightCollapsed ? 'none' : 'block';
    }

    if (this.timelineEl) {
      this.timelineEl.classList.toggle('collapsed', this.timelineCollapsed);
      this.timelineEl.style.height = this.timelineCollapsed ? '' : `${this.timelineHeight}px`;
      if (this.resizerTimeline) this.resizerTimeline.style.display = this.timelineCollapsed ? 'none' : 'block';
    }

    this._updateToggleButtons();

    if (this.onResizeCanvas) {
      setTimeout(() => this.onResizeCanvas(), 30);
    }
  }

  _updateToggleButtons() {
    const sidebarBtn = document.getElementById('btn-toggle-sidebar');
    if (sidebarBtn) {
      const label = this.leftCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)';
      sidebarBtn.title = label;
      sidebarBtn.setAttribute('aria-label', label);
    }
    const toggles = [
      { id: 'btn-toggle-left-panel', active: !this.leftCollapsed },
      { id: 'btn-toggle-left-narrator', active: !this.leftCollapsed },
      { id: 'btn-toggle-right-panel', active: !this.rightCollapsed },
      { id: 'btn-toggle-right-narrator', active: !this.rightCollapsed },
      { id: 'btn-toggle-timeline', active: !this.timelineCollapsed },
    ];
    toggles.forEach(({ id, active }) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', active);
    });
  }

  toggleLeft() {
    this.leftCollapsed = !this.leftCollapsed;
    this.applyLayout();
    this.saveLayout();
  }

  toggleRight() {
    this.rightCollapsed = !this.rightCollapsed;
    this.applyLayout();
    this.saveLayout();
  }

  toggleTimeline() {
    this.timelineCollapsed = !this.timelineCollapsed;
    this.applyLayout();
    this.saveLayout();
  }

  toggleZenMode() {
    this.isZenMode = !this.isZenMode;
    if (this.isZenMode) {
      document.body.classList.add('zen-mode');
      this.zenToolbar.classList.remove('hidden');
    } else {
      this.exitZenMode();
    }
    if (this.onResizeCanvas) {
      setTimeout(() => this.onResizeCanvas(), 50);
    }
  }

  exitZenMode() {
    this.isZenMode = false;
    document.body.classList.remove('zen-mode');
    this.zenToolbar.classList.add('hidden');
    if (this.onResizeCanvas) {
      setTimeout(() => this.onResizeCanvas(), 50);
    }
  }
}
