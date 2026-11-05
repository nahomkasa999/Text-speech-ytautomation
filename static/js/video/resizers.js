/**
 * Edge Resizers and Drag Handling for Studio Panels.
 */

export function createPanelResizers(manager) {
  if (manager.leftSidebarEl && manager.leftSidebarEl.parentNode) {
    manager.resizerLeft = document.createElement('div');
    manager.resizerLeft.className = 'panel-resizer resizer-left';
    manager.leftSidebarEl.parentNode.insertBefore(manager.resizerLeft, manager.leftSidebarEl.nextSibling);
  }

  if (manager.rightSidebarEl && manager.rightSidebarEl.parentNode) {
    manager.resizerRight = document.createElement('div');
    manager.resizerRight.className = 'panel-resizer resizer-right';
    manager.rightSidebarEl.parentNode.insertBefore(manager.resizerRight, manager.rightSidebarEl);
  }

  if (manager.timelineEl && manager.timelineEl.parentNode) {
    manager.resizerTimeline = document.createElement('div');
    manager.resizerTimeline.className = 'panel-resizer resizer-timeline';
    manager.timelineEl.parentNode.insertBefore(manager.resizerTimeline, manager.timelineEl);
  }

  manager.zenToolbar = document.createElement('div');
  manager.zenToolbar.className = 'zen-floating-toolbar hidden';
  manager.zenToolbar.innerHTML = `
    <button id="zen-play-btn" class="transport-btn play-btn" style="width:28px;height:28px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </button>
    <span id="zen-timecode" class="zen-timecode">00:00.0</span>
    <button id="zen-exit-btn" class="zen-exit-btn">Exit Zen (Esc)</button>
  `;
  document.body.appendChild(manager.zenToolbar);
  manager.zenToolbar.querySelector('#zen-exit-btn').addEventListener('click', () => manager.exitZenMode());

  attachResizerEvents(manager);
}

function attachResizerEvents(manager) {
  if (manager.resizerLeft) {
    manager.resizerLeft.addEventListener('mousedown', (e) => {
      e.preventDefault();
      manager.resizerLeft.classList.add('dragging');
      const startX = e.clientX;
      const startW = manager.leftWidth;
      const onMouseMove = (ev) => {
        manager.leftWidth = Math.max(180, Math.min(500, startW + (ev.clientX - startX)));
        manager.applyLayout();
      };
      const onMouseUp = () => {
        manager.resizerLeft.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        manager.saveLayout();
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    manager.resizerLeft.addEventListener('dblclick', () => {
      manager.leftWidth = 270;
      manager.applyLayout();
      manager.saveLayout();
    });
  }

  if (manager.resizerRight) {
    manager.resizerRight.addEventListener('mousedown', (e) => {
      e.preventDefault();
      manager.resizerRight.classList.add('dragging');
      const startX = e.clientX;
      const startW = manager.rightWidth;
      const onMouseMove = (ev) => {
        manager.rightWidth = Math.max(220, Math.min(550, startW - (ev.clientX - startX)));
        manager.applyLayout();
      };
      const onMouseUp = () => {
        manager.resizerRight.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        manager.saveLayout();
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    manager.resizerRight.addEventListener('dblclick', () => {
      manager.rightWidth = 320;
      manager.applyLayout();
      manager.saveLayout();
    });
  }

  if (manager.resizerTimeline) {
    manager.resizerTimeline.addEventListener('mousedown', (e) => {
      e.preventDefault();
      manager.resizerTimeline.classList.add('dragging');
      const startY = e.clientY;
      const startH = manager.timelineHeight;
      const onMouseMove = (ev) => {
        manager.timelineHeight = Math.max(140, Math.min(500, startH - (ev.clientY - startY)));
        manager.applyLayout();
      };
      const onMouseUp = () => {
        manager.resizerTimeline.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        manager.saveLayout();
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    manager.resizerTimeline.addEventListener('dblclick', () => {
      manager.timelineHeight = 220;
      manager.applyLayout();
      manager.saveLayout();
    });
  }
}
