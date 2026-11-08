/**
 * Video Studio Subsystem Initializer
 */

import { CanvasInteractionManager } from '../../video/interaction.js';
import { startAmbientPreview } from './playback/ambientPreview.js';
import { PanelManager } from '../../video/panels.js';
import { LayersPanel } from './layersPanel.js';
import { syncInspectorFromLayer } from './inspector/inspectorSync.js';
import { setupInspectorEvents } from './inspector/inspectorEvents.js';
import { buildTimelineRuler } from './timeline/timelineRuler.js';
import { renderSubtitleBlocks, renderMediaClips, updatePlayheadPosition } from './timeline/timelineTracks.js';
import { setupTimelineScrubber } from './timeline/timelineScrubber.js';
import { StudioAudioControls } from './playback/audioControls.js';
import { StudioPlayback } from './playback/studioPlayback.js';
import { BackgroundManager } from './templates/backgroundTemplates.js';
import { setupStudioExtensions } from './studioExtensions.js';
import { renderScene } from '../../video/renderer.js';

function setupStudioTimeline({ el, state, scene, interactionMgr, renderVideoFrame, selectLayer, onPlaybackChange }) {
  const updatePlayhead = (cur, dur) => {
    updatePlayheadPosition({
      cur, dur,
      timelineViewportEl: el.timelineViewport,
      timelinePlayheadEl: el.timelinePlayhead,
      videoTimecodeEl: el.videoTimecode,
      laneSubtitlesEl: el.laneSubtitles,
      syncedSegments: state.video.syncedSegments
    });
  };

  const buildTimeline = () => {
    const dur = el.videoAudioPlayer.duration || 10;
    buildTimelineRuler(el.timelineRuler, dur);
    renderSubtitleBlocks(el.laneSubtitles, state.video.syncedSegments, dur);
    const laneMedia = document.getElementById('lane-media');
    if (laneMedia) renderMediaClips(laneMedia, scene.layers, dur, selectLayer);
  };

  const playback = new StudioPlayback({
    el, state, scene,
    callbacks: {
      renderVideoFrame,
      updatePlayheadPosition: updatePlayhead,
      buildTimelineRulerAndTracks: buildTimeline,
      updateSelectionBox: () => interactionMgr.updateSelectionBox(),
      onPlaybackStateChange: onPlaybackChange
    }
  });

  setupTimelineScrubber({
    timelineViewportEl: el.timelineViewport,
    videoAudioPlayer: el.videoAudioPlayer,
    onSeek: (targetTime, dur) => { updatePlayhead(targetTime, dur); renderVideoFrame(targetTime); }
  });

  return { updatePlayhead, buildTimeline, playback };
}

function createStudioBootloader({ state, bgManager, layersPanel, selectLayer, renderVideoFrame }) {
  return function initVideoStudio() {
    if (!state.video.bgImage) {
      const savedBg = state.video.bgImageUrl || localStorage.getItem('book_narrator_bg_image');
      if (!savedBg) bgManager.loadTemplate('/templates/sample-book.jpg', false);
      else if (savedBg !== state.video.bgImageUrl) bgManager.loadTemplate(savedBg, false);
    } else {
      renderVideoFrame();
    }
    layersPanel.render();
    selectLayer('layer_captions');
  };
}

export function createStudioSubsystem({ el, state, scene, history, canvasCtx, getDraftService, getActiveText }) {
  const renderVideoFrame = (currentTime, ctx = canvasCtx) => {
    const cur = currentTime !== undefined ? currentTime : (el.videoAudioPlayer.currentTime || 0);
    const capLayer = scene.getLayer('layer_captions');
    if (capLayer && (!scene.syncedSegments || scene.syncedSegments.length === 0)) {
      capLayer.text = el.bookText.value.trim() ? el.bookText.value.trim().slice(0, 140) : '';
    }
    renderScene(ctx, scene, { currentTime: cur, bgImage: state.video.bgImage, isExport: ctx !== canvasCtx });
  };

  const syncInspector = () => syncInspectorFromLayer(el, scene, interactionMgr);
  startAmbientPreview({ el, state, scene, renderVideoFrame });

  const interactionMgr = new CanvasInteractionManager({
    stageEl: el.videoStageContainer || document.getElementById('video-stage-container'),
    containerEl: el.canvasContainer,
    canvasEl: el.videoCanvas,
    guidesEl: el.guidesCanvas || document.getElementById('guides-canvas'),
    selectionBoxEl: el.figmaSelectionBox,
    scene, history,
    onRender: () => renderVideoFrame(),
    onSelectionChange: () => { layersPanel.render(); syncInspector(); }
  });

  const panelMgr = new PanelManager({
    leftSidebarEl: document.getElementById('left-sidebar'),
    rightSidebarEl: document.getElementById('right-sidebar'),
    timelineEl: document.getElementById('capcut-timeline-container'),
    onResizeCanvas: () => interactionMgr.fitToScreen()
  });

  const selectLayer = (layerId) => {
    if (layerId === 'layer_captions' && !scene.getLayer('layer_captions')) {
      layersPanel.ensureOrRestoreCaptions();
      return;
    }
    scene.selectLayer(layerId);
    layersPanel.render();
    syncInspector();
    interactionMgr.updateSelectionBox();
    renderVideoFrame();
  };

  const layersPanel = new LayersPanel({
    el, scene, history,
    callbacks: {
      selectLayer: (id) => selectLayer(id),
      syncInspector, renderVideoFrame,
      debouncedSaveDraft: () => getDraftService()?.debouncedSaveDraft(),
      getActiveText
    }
  });

  const bgManager = new BackgroundManager({
    el, state,
    callbacks: {
      renderVideoFrame,
      debouncedSaveDraft: () => getDraftService()?.debouncedSaveDraft(),
      saveDraft: () => getDraftService()?.saveDraft()
    }
  });

  const audioControls = new StudioAudioControls({
    el, state,
    onSettingChanged: () => getDraftService()?.debouncedSaveDraft()
  });

  let extensions = null;
  const { updatePlayhead, buildTimeline, playback } = setupStudioTimeline({
    el, state, scene, interactionMgr, renderVideoFrame, selectLayer,
    onPlaybackChange: (isPlaying, cur) => extensions?.bgmManager.syncPlayback(isPlaying, cur)
  });

  extensions = setupStudioExtensions({
    el, state, scene, history, canvasCtx, interactionMgr,
    callbacks: {
      deleteLayer: (l) => layersPanel.deleteLayer(l),
      renderLayersList: () => layersPanel.render(),
      buildTimeline,
      renderVideoFrame,
      loadBgTemplate: (url, save) => bgManager.loadTemplate(url, save),
      saveDraft: () => getDraftService()?.saveDraft()
    }
  });

  setupInspectorEvents({
    el, scene, canvasCtx, interactionMgr,
    callbacks: {
      deleteLayer: (l) => layersPanel.deleteLayer(l),
      renderLayersList: () => layersPanel.render(),
      renderVideoFrame,
      debouncedSaveDraft: () => getDraftService()?.debouncedSaveDraft()
    }
  });

  const initVideoStudio = createStudioBootloader({
    state, bgManager, layersPanel, selectLayer, renderVideoFrame
  });

  return {
    renderVideoFrame, selectLayer, layersPanel, bgManager,
    audioControls, updatePlayhead, buildTimeline, playback,
    panelMgr, interactionMgr, initVideoStudio, extensions
  };
}
