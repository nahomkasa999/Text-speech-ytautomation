/**
 * AI Book Narrator & CapCut/Figma Video Studio
 * Main Application Orchestrator and Bootstrapper.
 */

import { Scene } from './video/scene.js';
import { HistoryManager } from './video/history.js';
import { getDOMElements } from './modules/ui/domElements.js';
import { setupTopBarToggles } from './modules/ui/topBarToggles.js';
import { createInitialLayers, createInitialState } from './modules/studio/studioState.js';
import { createStudioSubsystem } from './modules/studio/studioInit.js';
import { createNarratorSubsystem } from './modules/narrator/narratorInit.js';
import { loadPartials } from './modules/ui/partialLoader.js';
import { initPopovers } from './modules/ui/popover.js';
import { initUpdater } from './modules/ui/updater.js';
import { hasAudio } from './modules/narrator/sessionsManager.js';

async function setupApp() {
  await loadPartials();
  initPopovers();
  initUpdater();

  const history = new HistoryManager();
  const scene = new Scene({ canvas: { width: 1920, height: 1080, background: '#C85A32' }, duration: 10 });
  const [defaultCaptionLayer, defaultAudioWidget] = createInitialLayers();
  scene.addLayer(defaultCaptionLayer);
  scene.addLayer(defaultAudioWidget);
  scene.selectLayer('layer_captions');

  const state = createInitialState();
  const el = getDOMElements();
  const canvasCtx = el.videoCanvas.getContext('2d');

  let draftServiceRef = null;
  const studio = createStudioSubsystem({
    el, state, scene, history, canvasCtx,
    getDraftService: () => draftServiceRef,
    getActiveText: () => (state.activeSession?.text || el.bookText.value)
  });

  const narrator = createNarratorSubsystem({ el, state, scene, studio });
  draftServiceRef = narrator.draftService;

  setupTopBarToggles({
    el,
    panelMgr: studio.panelMgr,
    playback: studio.playback,
    modeSwitcher: narrator.modeSwitcher
  });

  bootstrapData({ narrator, studio, state });
}

async function bootstrapData({ narrator, studio, state }) {
  await narrator.engineSelector.initialize();
  await narrator.draftService.restoreDraft();
  await narrator.sessionsManager.loadSessions();
  const latestWithAudio = state.sessions.find(hasAudio);
  if (latestWithAudio && !state.activeSession) {
    // keepLayers: don't wipe the layers just restored from the saved draft.
    narrator.sessionsManager.selectSession(latestWithAudio, { keepLayers: true });
  }
  studio.initVideoStudio();
  narrator.refreshStats();
}

document.addEventListener('DOMContentLoaded', setupApp);
