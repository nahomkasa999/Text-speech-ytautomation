/**
 * VS Code-Style Collapsible Panels, Edge Resizers, and Zen Mode Manager
 * Persistent layout across sessions, keyboard shortcuts, canvas auto-refit
 */

export class PanelManager {
  constructor({ leftSidebarEl, rightSidebarEl, timelineEl, onResizeCanvas }) {
    this.leftSidebarEl = leftSidebarEl;
    this.rightSidebarEl = rightSidebarEl;
    this.timelineEl = timelineEl;
    this.onResizeCanvas = onResizeCanvas;

    // Load saved layout or defaults
    const saved = this.loadLayout();
    this.leftWidth = saved.leftWidth || 270;
    this.rightWidth = saved.rightWidth || 320;
    this.timelineHeight = saved.timelineHeight || 220;
    this.leftCollapsed = !!saved.leftCollapsed;
    this.rightCollapsed = !!saved.rightCollapsed;
    this.timelineCollapsed = !!saved.timelineCollapsed;
    this.isZenMode = false;

    this.createResizersAndZenToolbar();
    this.applyLayout();
    this.initShortcuts();
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

  createResizersAndZenToolbar() {
    // 1. Left panel resizer
    if (this.leftSidebarEl && this.leftSidebarEl.parentNode) {
      this.resizerLeft = document.createElement('div');
      this.resizerLeft.className = 'panel-resizer resizer-left';
      this.leftSidebarEl.parentNode.insertBefore(this.resizerLeft, this.leftSidebarEl.nextSibling);
    }

    // 2. Right panel resizer
    if (this.rightSidebarEl && this.rightSidebarEl.parentNode) {
      this.resizerRight = document.createElement('div');
      this.resizerRight.className = 'panel-resizer resizer-right';
      this.rightSidebarEl.parentNode.insertBefore(this.resizerRight, this.rightSidebarEl);
    }

    // 3. Timeline resizer
    if (this.timelineEl && this.timelineEl.parentNode) {
      this.resizerTimeline = document.createElement('div');
      this.resizerTimeline.className = 'panel-resizer resizer-timeline';
      this.timelineEl.parentNode.insertBefore(this.resizerTimeline, this.timelineEl);
    }

    // 4. Zen Mode Floating Toolbar
    this.zenToolbar = document.createElement('div');
    this.zenToolbar.className = 'zen-floating-toolbar hidden';
    this.zenToolbar.innerHTML = `
      <button id="zen-play-btn" class="transport-btn play-btn" style="width:28px;height:28px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>
      <span id="zen-timecode" class="zen-timecode">00:00.0</span>
      <button id="zen-exit-btn" class="zen-exit-btn">Exit Zen (Esc)</button>
    `;
    document.body.appendChild(this.zenToolbar);

    this.zenToolbar.querySelector('#zen-exit-btn').addEventListener('click', () => this.exitZenMode());

    // Drag events on resizers
    this.attachResizerEvents();
  }

  attachResizerEvents() {
    // Left Edge Resizer
    if (this.resizerLeft) {
      this.resizerLeft.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.resizerLeft.classList.add('dragging');
        const startX = e.clientX;
        const startW = this.leftWidth;

        const onMouseMove = (ev) => {
          const newW = Math.max(180, Math.min(500, startW + (ev.clientX - startX)));
          this.leftWidth = newW;
          this.applyLayout();
        };

        const onMouseUp = () => {
          this.resizerLeft.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          this.saveLayout();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      // Double-click resets Left Width to 270px
      this.resizerLeft.addEventListener('dblclick', () => {
        this.leftWidth = 270;
        this.applyLayout();
        this.saveLayout();
      });
    }

    // Right Edge Resizer
    if (this.resizerRight) {
      this.resizerRight.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.resizerRight.classList.add('dragging');
        const startX = e.clientX;
        const startW = this.rightWidth;

        const onMouseMove = (ev) => {
          const newW = Math.max(220, Math.min(550, startW - (ev.clientX - startX)));
          this.rightWidth = newW;
          this.applyLayout();
        };

        const onMouseUp = () => {
          this.resizerRight.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          this.saveLayout();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      // Double-click resets Right Width to 320px
      this.resizerRight.addEventListener('dblclick', () => {
        this.rightWidth = 320;
        this.applyLayout();
        this.saveLayout();
      });
    }

    // Timeline Height Resizer
    if (this.resizerTimeline) {
      this.resizerTimeline.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.resizerTimeline.classList.add('dragging');
        const startY = e.clientY;
        const startH = this.timelineHeight;

        const onMouseMove = (ev) => {
          const newH = Math.max(140, Math.min(500, startH - (ev.clientY - startY)));
          this.timelineHeight = newH;
          this.applyLayout();
        };

        const onMouseUp = () => {
          this.resizerTimeline.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          this.saveLayout();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      // Double-click resets Timeline Height to 220px
      this.resizerTimeline.addEventListener('dblclick', () => {
        this.timelineHeight = 220;
        this.applyLayout();
        this.saveLayout();
      });
    }
  }

  applyLayout() {
    // Left
    if (this.leftSidebarEl) {
      if (this.leftCollapsed) {
        this.leftSidebarEl.classList.add('collapsed');
        if (this.resizerLeft) this.resizerLeft.style.display = 'none';
      } else {
        this.leftSidebarEl.classList.remove('collapsed');
        this.leftSidebarEl.style.width = `${this.leftWidth}px`;
        if (this.resizerLeft) this.resizerLeft.style.display = 'block';
      }
    }

    // Right
    if (this.rightSidebarEl) {
      if (this.rightCollapsed) {
        this.rightSidebarEl.classList.add('collapsed');
        if (this.resizerRight) this.resizerRight.style.display = 'none';
      } else {
        this.rightSidebarEl.classList.remove('collapsed');
        this.rightSidebarEl.style.width = `${this.rightWidth}px`;
        if (this.resizerRight) this.resizerRight.style.display = 'block';
      }
    }

    // Timeline
    if (this.timelineEl) {
      if (this.timelineCollapsed) {
        this.timelineEl.classList.add('collapsed');
        if (this.resizerTimeline) this.resizerTimeline.style.display = 'none';
      } else {
        this.timelineEl.classList.remove('collapsed');
        this.timelineEl.style.height = `${this.timelineHeight}px`;
        if (this.resizerTimeline) this.resizerTimeline.style.display = 'block';
      }
    }

    // Update Toggle Button Active States
    const btnLeft = document.getElementById('btn-toggle-left-panel');
    const btnLeftNarrator = document.getElementById('btn-toggle-left-narrator');
    const btnRight = document.getElementById('btn-toggle-right-panel');
    const btnRightNarrator = document.getElementById('btn-toggle-right-narrator');
    const btnTimeline = document.getElementById('btn-toggle-timeline');

    if (btnLeft) btnLeft.classList.toggle('active', !this.leftCollapsed);
    if (btnLeftNarrator) btnLeftNarrator.classList.toggle('active', !this.leftCollapsed);
    if (btnRight) btnRight.classList.toggle('active', !this.rightCollapsed);
    if (btnRightNarrator) btnRightNarrator.classList.toggle('active', !this.rightCollapsed);
    if (btnTimeline) btnTimeline.classList.toggle('active', !this.timelineCollapsed);

    // Re-fit canvas smoothly
    if (this.onResizeCanvas) {
      setTimeout(() => this.onResizeCanvas(), 30);
    }
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

  initShortcuts() {
    let ctrlKPressed = false;
    let ctrlKTimer = null;

    window.addEventListener('keydown', (e) => {
      // Ignore if typing in text inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Ctrl + B -> Toggle Left Sidebar
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyB') {
        e.preventDefault();
        this.toggleLeft();
        return;
      }

      // Ctrl + Alt + B -> Toggle Right Inspector
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyB') {
        e.preventDefault();
        this.toggleRight();
        return;
      }

      // Ctrl + J -> Toggle Timeline
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyJ') {
        e.preventDefault();
        this.toggleTimeline();
        return;
      }

      // F11 -> Toggle Zen Mode
      if (e.code === 'F11') {
        e.preventDefault();
        this.toggleZenMode();
        return;
      }

      // Ctrl+K then Z -> Zen mode
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        ctrlKPressed = true;
        clearTimeout(ctrlKTimer);
        ctrlKTimer = setTimeout(() => { ctrlKPressed = false; }, 1000);
        return;
      }

      if (ctrlKPressed && e.code === 'KeyZ') {
        e.preventDefault();
        ctrlKPressed = false;
        this.toggleZenMode();
        return;
      }

      // Esc exits Zen Mode
      if (e.key === 'Escape' && this.isZenMode) {
        e.preventDefault();
        this.exitZenMode();
      }
    });
  }
}
