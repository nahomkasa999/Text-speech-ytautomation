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
    this.leftWidth = saved.leftWidth || 270;
    this.rightWidth = saved.rightWidth || 320;
    this.timelineHeight = saved.timelineHeight || 220;
    this.leftCollapsed = !!saved.leftCollapsed;
    this.rightCollapsed = !!saved.rightCollapsed;
    this.timelineCollapsed = !!saved.timelineCollapsed;
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
