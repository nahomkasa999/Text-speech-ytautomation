/**
 * Narrator Subsystem Initializer
 */

import { updateTextStats } from './textStats.js';
import { EngineSelector } from './engineSelector.js';
import { setupVoicePreview } from './voicePreview.js';
import { SessionsManager } from './sessionsManager.js';
import { NarrationGenerator } from './generator.js';
import { setupTextEditor } from './textEditor.js';
import { setupPauseAndSpeedControls } from './pauseControls.js';
import { DraftService } from '../services/draftService.js';
import { ModeSwitcher } from '../ui/modeSwitcher.js';
import { ExportManager } from '../studio/exporter/exportManager.js';
import { VoiceDesignManager } from './voiceDesign.js';
import { attachDownloadLink } from '../services/fileSaver.js';

export function createNarratorSubsystem({ el, state, scene, studio }) {
  const refreshStats = () => updateTextStats(el.bookText, state.speed, el.statWords, el.statChars, el.statTime);

  const sessionsManager = new SessionsManager({
    el, state, scene,
    callbacks: {
      updateStats: refreshStats,
      loadBackgroundTemplate: (url, save) => studio.bgManager.loadTemplate(url, save),
      renderLayersList: () => studio.layersPanel.render(),
      selectLayer: studio.selectLayer,
      buildTimelineRulerAndTracks: studio.buildTimeline,
      renderVideoFrame: studio.renderVideoFrame,
      updatePlayheadPosition: studio.updatePlayhead
    }
  });

  const draftService = new DraftService({
    el, state, scene,
    callbacks: {
      renderVoices: () => engineSelector.renderVoices(),
      setAudioSpeed: (s, save) => studio.audioControls.setSpeed(s, save),
      setAudioVolume: (v, save) => studio.audioControls.setVolume(v, save),
      loadBackgroundTemplate: (url, save) => studio.bgManager.loadTemplate(url, save),
      updateStats: refreshStats
    }
  });

  const engineSelector = new EngineSelector({
    el, state,
    onEngineChanged: () => draftService.debouncedSaveDraft(),
    onVoiceChanged: () => draftService.debouncedSaveDraft()
  });

  setupVoicePreview({ el, state });
  attachDownloadLink(el.btnDownloadAudio);

  new VoiceDesignManager({
    el, state,
    callbacks: {
      renderVoices: () => engineSelector.renderVoices(),
      onVoiceCreated: () => draftService.debouncedSaveDraft()
    }
  });

  new NarrationGenerator({
    el, state,
    callbacks: {
      loadSessions: () => sessionsManager.loadSessions(),
      selectSession: (sess) => sessionsManager.selectSession(sess),
      saveBgForActiveSession: (url) => studio.bgManager.saveBgForActiveSession(url),
      getPersistableBgUrl: () => draftService.getPersistableBgUrl()
    }
  });

  const modeSwitcher = new ModeSwitcher({
    el, state,
    callbacks: {
      selectSession: (sess) => sessionsManager.selectSession(sess),
      buildTimeline: studio.buildTimeline,
      updatePlayhead: studio.updatePlayhead,
      initVideoStudio: studio.initVideoStudio,
      fitCanvas: () => studio.interactionMgr.fitToScreen()
    }
  });

  setupTextEditor({
    el, state, scene,
    callbacks: {
      updateStats: refreshStats,
      debouncedSaveDraft: () => draftService.debouncedSaveDraft(),
      renderHistoryList: () => sessionsManager.renderHistoryList(),
      setMode: (m) => modeSwitcher.setMode(m),
      renderLayersList: () => studio.layersPanel.render(),
      selectLayer: studio.selectLayer,
      buildTimelineRulerAndTracks: studio.buildTimeline,
      renderVideoFrame: studio.renderVideoFrame
    }
  });

  new ExportManager({
    el, state, scene,
    callbacks: {
      renderVideoFrame: studio.renderVideoFrame,
      updatePlayheadPosition: studio.updatePlayhead
    }
  });

  setupPauseAndSpeedControls({
    el, state, sessionsManager,
    callbacks: {
      refreshStats,
      debouncedSaveDraft: () => draftService.debouncedSaveDraft(),
      buildTimeline: studio.buildTimeline,
      renderVideoFrame: studio.renderVideoFrame
    }
  });

  return { refreshStats, sessionsManager, draftService, engineSelector, modeSwitcher };
}
