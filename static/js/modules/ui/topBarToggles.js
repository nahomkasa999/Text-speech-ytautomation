/**
 * Header panel toggles, Zen mode triggers, and global hotkeys.
 */

export function setupTopBarToggles({ el, panelMgr, playback, modeSwitcher }) {
  if (el.btnToggleLeftNarrator) el.btnToggleLeftNarrator.addEventListener('click', () => panelMgr.toggleLeft());
  if (el.btnToggleRightNarrator) el.btnToggleRightNarrator.addEventListener('click', () => panelMgr.toggleRight());
  if (el.btnToggleLeftPanel) el.btnToggleLeftPanel.addEventListener('click', () => panelMgr.toggleLeft());
  if (el.btnToggleRightPanel) el.btnToggleRightPanel.addEventListener('click', () => panelMgr.toggleRight());
  if (el.btnToggleTimeline) el.btnToggleTimeline.addEventListener('click', () => panelMgr.toggleTimeline());
  if (el.btnZenMode) el.btnZenMode.addEventListener('click', () => panelMgr.toggleZenMode());

  const zenPlayBtn = document.getElementById('zen-play-btn');
  if (zenPlayBtn) zenPlayBtn.addEventListener('click', () => playback.togglePlay());

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (modeSwitcher.currentMode === 'video' && e.key.toLowerCase() === 't') {
      el.btnAddTextLayer.click();
    }
    if (modeSwitcher.currentMode === 'video' && e.code === 'Space') {
      e.preventDefault();
      playback.togglePlay();
    }
  });
}
