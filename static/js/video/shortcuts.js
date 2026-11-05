/**
 * Keyboard shortcuts for Studio panel toggles and Zen Mode.
 */

export function initPanelShortcuts(manager) {
  let ctrlKPressed = false;
  let ctrlKTimer = null;

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyB') {
      e.preventDefault();
      manager.toggleLeft();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyB') {
      e.preventDefault();
      manager.toggleRight();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyJ') {
      e.preventDefault();
      manager.toggleTimeline();
      return;
    }

    if (e.code === 'F11') {
      e.preventDefault();
      manager.toggleZenMode();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
      ctrlKPressed = true;
      clearTimeout(ctrlKTimer);
      ctrlKTimer = setTimeout(() => { ctrlKPressed = false; }, 1000);
      return;
    }

    if (ctrlKPressed && e.code === 'KeyZ') {
      e.preventDefault();
      ctrlKPressed = false;
      manager.toggleZenMode();
      return;
    }

    if (e.key === 'Escape' && manager.isZenMode) {
      e.preventDefault();
      manager.exitZenMode();
    }
  });
}
