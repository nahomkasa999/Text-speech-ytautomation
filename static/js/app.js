/**
 * AI Book Narrator & CapCut/Figma Video Studio
 * Multi-layer frames, dynamic typography, CapCut timeline & audio speed control.
 */

import { Scene, createLayerFromData, TextLayer, TranscriptionLayer, FrameLayer, ShapeLayer, AudioWidgetLayer } from './video/scene.js';
import { HistoryManager, PropertyChangeCommand, AddLayerCommand, RemoveLayerCommand, BatchTransformCommand } from './video/history.js';
import { renderScene, measureTextLayout } from './video/renderer.js';
import { CanvasInteractionManager } from './video/interaction.js';
import { PanelManager } from './video/panels.js';

document.addEventListener('DOMContentLoaded', () => {
  let currentMode = 'narration';

  // Initialize Core Scene & History
  const history = new HistoryManager();
  const scene = new Scene({
    canvas: { width: 1920, height: 1080, background: '#C85A32' },
    duration: 10
  });

  // Non-blocking Toast Notification (No native alert() calls)
  const showToast = (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    const iconSvg = type === 'error'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : (type === 'success'
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`);

    toast.innerHTML = `<span class="toast-icon">${iconSvg}</span><span class="toast-text">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('toast-show'), 10);
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3500);
  };

  // Default Layers
  const defaultCaptionLayer = new TranscriptionLayer({
    id: 'layer_captions',
    name: 'Synced Captions',
    x: 880,
    y: 240,
    width: 920,
    fontSize: 54,
    fill: '#111827',
    align: 'left'
  });
  const defaultAudioWidget = new AudioWidgetLayer({
    id: 'layer_player_widget',
    name: 'Audio Player Bar',
    x: 840,
    y: 720,
    width: 940,
    color: '#111827',
    thickness: 2.5,
    playheadRadius: 7
  });
  scene.addLayer(defaultCaptionLayer);
  scene.addLayer(defaultAudioWidget);
  scene.selectLayer('layer_captions');

  // Master State
  const state = {
    engine: 'local',
    voices: { local: [], deployed: [], cloud_api: [] },
    selectedVoice: 'am_adam',
    speed: 1.0,
    paragraphPause: 0.6,
    sentencePause: 0.25,
    sessions: [],
    activeSession: null,
    isGenerating: false,

    // Video Studio State
    video: {
      bgImage: null,
      bgImageLoaded: false,
      audioSpeed: 1.0,
      isPlaying: false,
      isExporting: false,
      selectedLayerId: 'layer_captions',
      syncedSegments: []
    }
  };

  // DOM Elements
  const el = {
    // Mode Switchers
    tabModeNarration: document.getElementById('tab-mode-narration'),
    tabModeVideo: document.getElementById('tab-mode-video'),
    narrationView: document.getElementById('narration-view'),
    videoStudioView: document.getElementById('video-studio-view'),
    panelVoiceSettings: document.getElementById('panel-voice-settings'),
    panelVideoSettings: document.getElementById('panel-video-settings'),

    // Narration
    bookText: document.getElementById('book-text'),
    projectTitle: document.getElementById('project-title'),
    statWords: document.getElementById('stat-words'),
    statChars: document.getElementById('stat-chars'),
    statTime: document.getElementById('stat-time'),
    engineTabs: document.querySelectorAll('.engine-tab'),
    voiceSelect: document.getElementById('voice-select'),
    voiceDesc: document.getElementById('voice-desc'),
    btnPreviewVoice: document.getElementById('btn-preview-voice'),
    previewAudioPlayer: document.getElementById('preview-audio-player'),
    speedSlider: document.getElementById('speed-slider'),
    speedVal: document.getElementById('speed-val'),
    pauseParaSlider: document.getElementById('pause-para-slider'),
    pauseParaVal: document.getElementById('pause-para-val'),
    pauseSentSlider: document.getElementById('pause-sent-slider'),
    pauseSentVal: document.getElementById('pause-sent-val'),
    panelDeployedSettings: document.getElementById('panel-deployed-settings'),
    deployedEndpoint: document.getElementById('deployed-endpoint'),
    deployedToken: document.getElementById('deployed-token'),
    deployedInstruction: document.getElementById('deployed-instruction'),
    panelCloudSettings: document.getElementById('panel-cloud-settings'),
    cloudProvider: document.getElementById('cloud-provider'),
    cloudApiKey: document.getElementById('cloud-api-key'),
    btnGenerate: document.getElementById('btn-generate'),
    btnGenerateLabel: document.getElementById('btn-generate-label'),
    progressCard: document.getElementById('progress-card'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    progressChunkInfo: document.getElementById('progress-chunk-info'),
    progressEta: document.getElementById('progress-eta'),
    progressSnippetText: document.getElementById('progress-snippet-text'),
    progressStatusTitle: document.getElementById('progress-status-title'),
    audioDeck: document.getElementById('audio-deck'),
    deckTitle: document.getElementById('deck-title'),
    deckSubtitle: document.getElementById('deck-subtitle'),
    mainAudioPlayer: document.getElementById('main-audio-player'),
    btnDownloadAudio: document.getElementById('btn-download-audio'),
    btnOpenInVideoStudio: document.getElementById('btn-open-in-video-studio'),
    historyList: document.getElementById('history-list'),
    sessionCountBadge: document.getElementById('session-count-badge'),
    btnNewProject: document.getElementById('btn-new-project'),
    btnClearText: document.getElementById('btn-clear-text'),
    fileUploader: document.getElementById('file-uploader'),
    engineStatusDot: document.getElementById('engine-status-dot'),
    engineStatusText: document.getElementById('engine-status-text'),
    autosaveStatus: document.getElementById('autosave-status'),

    // Video Studio & Figma Canvas
    videoCanvas: document.getElementById('video-canvas'),
    canvasContainer: document.getElementById('canvas-container'),
    videoStageContainer: document.getElementById('video-stage-container'),
    guidesCanvas: document.getElementById('guides-canvas'),
    figmaSelectionBox: document.getElementById('figma-selection-box'),
    selectionTagName: document.getElementById('selection-tag-name'),
    bgImageUploader: document.getElementById('bg-image-uploader'),
    btnSampleTemplate: document.getElementById('btn-sample-template'),
    btnAddTextLayer: document.getElementById('btn-add-text-layer'),
    // Shared Master Audio Player (Guarantees sound always works in both Narrator & Video Studio)
    videoAudioPlayer: document.getElementById('main-audio-player'),
    btnExportMp4: document.getElementById('btn-export-mp4'),
    exportBtnLabel: document.getElementById('export-btn-label'),
    videoProjectName: document.getElementById('video-project-name'),

    // Top Bar Panel Toggles & Zen Mode
    btnToggleLeftNarrator: document.getElementById('btn-toggle-left-narrator'),
    btnToggleRightNarrator: document.getElementById('btn-toggle-right-narrator'),
    btnToggleLeftPanel: document.getElementById('btn-toggle-left-panel'),
    btnToggleRightPanel: document.getElementById('btn-toggle-right-panel'),
    btnToggleTimeline: document.getElementById('btn-toggle-timeline'),
    btnZenMode: document.getElementById('btn-zen-mode'),

    // CapCut Timeline
    btnVideoPlay: document.getElementById('btn-video-play'),
    btnVideoStop: document.getElementById('btn-video-stop'),
    videoPlaySvg: document.getElementById('video-play-svg'),
    videoTimecode: document.getElementById('video-timecode'),
    timelineViewport: document.getElementById('timeline-viewport'),
    timelineRuler: document.getElementById('timeline-ruler'),
    laneSubtitles: document.getElementById('lane-subtitles'),
    timelineAudioBlock: document.getElementById('timeline-audio-block'),
    timelinePlayhead: document.getElementById('timeline-playhead'),
    speedBtns: document.querySelectorAll('.speed-btn'),

    // Figma Property Inspector (Right Sidebar)
    layersList: document.getElementById('layers-list'),
    customTextEditorGroup: document.getElementById('custom-text-editor-group'),
    layerContentInput: document.getElementById('layer-content-input'),
    propPosX: document.getElementById('prop-pos-x'),
    propPosY: document.getElementById('prop-pos-y'),
    propSizeW: document.getElementById('prop-size-w'),
    propSizeH: document.getElementById('prop-size-h'),
    btnDeleteLayer: document.getElementById('btn-delete-layer'),
    typographySettingsGroup: document.getElementById('typography-settings-group'),
    captionFontSelect: document.getElementById('caption-font-select'),
    captionSizeNum: document.getElementById('caption-size-num'),
    captionColorPicker: document.getElementById('caption-color-picker'),
    colorPresetBtns: document.querySelectorAll('.color-preset-btn'),
    alignBtns: document.querySelectorAll('#align-control .segment-btn'),
    casingBtns: document.querySelectorAll('#casing-settings-group .segment-btn'),
    weightBtns: document.querySelectorAll('#weight-settings-group .segment-btn'),
    togglePlayerWidget: document.getElementById('toggle-player-widget'),
  };

  const canvasCtx = el.videoCanvas.getContext('2d');

  // =========================================================
  // VIEW MODE SWITCHER
  // =========================================================
  const setMode = (mode) => {
    currentMode = mode;
    el.tabModeNarration.classList.toggle('active', mode === 'narration');
    el.tabModeVideo.classList.toggle('active', mode === 'video');

    if (mode === 'narration') {
      el.narrationView.classList.remove('hidden');
      el.videoStudioView.classList.add('hidden');
      el.panelVoiceSettings.classList.remove('hidden');
      el.panelVideoSettings.classList.add('hidden');
    } else {
      el.narrationView.classList.add('hidden');
      el.videoStudioView.classList.remove('hidden');
      el.panelVoiceSettings.classList.add('hidden');
      el.panelVideoSettings.classList.remove('hidden');

      if (state.sessions.length > 0 && (!state.activeSession || !el.mainAudioPlayer.src)) {
        selectSession(state.sessions[0]);
      } else if (state.activeSession) {
        buildTimelineRulerAndTracks();
        updatePlayheadPosition(el.mainAudioPlayer.currentTime || 0, el.mainAudioPlayer.duration || 10);
      }
      initVideoStudio();
      requestAnimationFrame(() => {
        if (typeof interactionMgr !== 'undefined' && interactionMgr.fitToScreen) {
          interactionMgr.fitToScreen();
        }
      });
      setTimeout(() => {
        if (typeof interactionMgr !== 'undefined' && interactionMgr.fitToScreen) {
          interactionMgr.fitToScreen();
        }
      }, 100);
    }
  };

  el.tabModeNarration.addEventListener('click', () => setMode('narration'));
  el.tabModeVideo.addEventListener('click', () => setMode('video'));
  el.btnOpenInVideoStudio.addEventListener('click', () => setMode('video'));

  // =========================================================
  // DRAFT AUTO-SAVE BUFFER (NEVER LOSE WORK ON CLOSE/REFRESH)
  // =========================================================
  let saveDraftTimer = null;
  const saveDraft = async () => {
    if (el.autosaveStatus) el.autosaveStatus.textContent = 'Saving...';
    const draft = {
      title: el.projectTitle.value,
      text: el.bookText.value,
      engine: state.engine,
      voice: state.selectedVoice,
      speed: state.speed,
      paragraphPause: state.paragraphPause,
      sentencePause: state.sentencePause,
      videoLayers: scene.toJSON().layers,
      audioSpeed: state.video.audioSpeed,
      updated_at: Date.now()
    };

    // 1. Instant local storage buffer
    try {
      localStorage.setItem('book_narrator_draft_buffer', JSON.stringify(draft));
    } catch (e) {}

    // 2. Persistent disk file buffer on server (outputs/draft.json)
    try {
      await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
          text: draft.text,
          engine: draft.engine,
          voice: draft.voice,
          speed: draft.speed,
          paragraph_pause: draft.paragraphPause,
          sentence_pause: draft.sentencePause,
          audio_speed: draft.audioSpeed,
          layers: draft.videoLayers
        })
      });
    } catch (e) {}

    if (el.autosaveStatus) {
      setTimeout(() => {
        el.autosaveStatus.textContent = 'Saved';
      }, 300);
    }
  };

  const debouncedSaveDraft = () => {
    clearTimeout(saveDraftTimer);
    saveDraftTimer = setTimeout(saveDraft, 400);
  };

  const restoreDraft = async () => {
    let draft = null;
    try {
      const localStr = localStorage.getItem('book_narrator_draft_buffer');
      if (localStr) draft = JSON.parse(localStr);
    } catch (e) {}

    // Fallback to server disk file if localStorage is empty
    if (!draft || (!draft.text && !draft.title)) {
      try {
        const res = await fetch('/api/draft').then(r => r.json());
        if (res && (res.text || res.title || (res.layers && res.layers.length > 0))) {
          draft = {
            title: res.title,
            text: res.text,
            engine: res.engine,
            voice: res.voice,
            speed: res.speed,
            paragraphPause: res.paragraph_pause,
            sentencePause: res.sentence_pause,
            audioSpeed: res.audio_speed,
            videoLayers: res.layers
          };
        }
      } catch (e) {}
    }

    if (draft && (draft.text || draft.title || (draft.videoLayers && draft.videoLayers.length > 0))) {
      if (draft.text) el.bookText.value = draft.text;
      if (draft.title) el.projectTitle.value = draft.title || '';
      if (draft.speed) {
        state.speed = draft.speed;
        el.speedSlider.value = draft.speed;
        el.speedVal.textContent = `${draft.speed.toFixed(2)}x`;
      }
      if (draft.paragraphPause) {
        state.paragraphPause = draft.paragraphPause;
        el.pauseParaSlider.value = draft.paragraphPause;
        el.pauseParaVal.textContent = `${draft.paragraphPause.toFixed(1)}s`;
      }
      if (draft.sentencePause) {
        state.sentencePause = draft.sentencePause;
        el.pauseSentSlider.value = draft.sentencePause;
        el.pauseSentVal.textContent = `${draft.sentencePause.toFixed(2)}s`;
      }
      if (draft.engine) {
        state.engine = draft.engine;
        el.engineTabs.forEach(t => t.classList.toggle('active', t.dataset.engine === state.engine));
        el.panelDeployedSettings.classList.toggle('hidden', state.engine !== 'deployed');
        el.panelCloudSettings.classList.toggle('hidden', state.engine !== 'cloud_api');
        renderVoices();
      }
      if (draft.voice) {
        state.selectedVoice = draft.voice;
        el.voiceSelect.value = draft.voice;
      }
      if (draft.audioSpeed) {
        state.video.audioSpeed = draft.audioSpeed;
        el.videoAudioPlayer.playbackRate = draft.audioSpeed;
        el.speedBtns.forEach(b => b.classList.toggle('active', parseFloat(b.dataset.speed) === draft.audioSpeed));
      }
      if (draft.videoLayers && Array.isArray(draft.videoLayers) && draft.videoLayers.length > 0) {
        scene.layers = [];
        draft.videoLayers.forEach(lData => {
          // Normalize coordinate migration if old fractional format
          if (lData.x <= 1 && lData.width <= 1) {
            lData.x = Math.round(lData.x * 1920);
            lData.y = Math.round(lData.y * 1080);
            lData.width = Math.round(lData.width * 1920);
          }
          const l = createLayerFromData(lData);
          if (l) scene.addLayer(l);
        });
        if (!scene.getSelectedLayer()) {
          scene.selectLayer(scene.layers[0]?.id || 'layer_captions');
        }
      }
      updateStats();
      if (el.autosaveStatus) el.autosaveStatus.textContent = 'Draft Restored';
    }
  };

  // Auto-save listeners on text editor and project title
  el.bookText.addEventListener('input', () => {
    updateStats();
    debouncedSaveDraft();
  });
  el.projectTitle.addEventListener('input', () => {
    debouncedSaveDraft();
  });
  if (el.btnClearText) {
    el.btnClearText.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the text editor?')) {
        el.bookText.value = '';
        updateStats();
        debouncedSaveDraft();
      }
    });
  }

  // =========================================================
  // TIME & TEXT FORMATTING UTILS
  // =========================================================
  const updateStats = () => {
    const text = el.bookText.value.trim();
    const chars = text.length;
    const words = text ? text.split(/\s+/).length : 0;
    const wordsPerMinute = 150 * state.speed;
    const totalMinutes = words > 0 ? Math.ceil(words / wordsPerMinute) : 0;
    
    el.statWords.textContent = words.toLocaleString();
    el.statChars.textContent = chars.toLocaleString();
    el.statTime.textContent = totalMinutes < 60 ? `~${totalMinutes}m` : `~${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  };

  const formatTimecode = (seconds) => {
    const s = Math.max(0, seconds || 0);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const formatDuration = (seconds) => {
    const s = Math.round(seconds || 0);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // =========================================================
  // CORE SCENE RENDERING & INTERACTION MANAGERS
  // =========================================================
  const renderVideoFrame = (currentTime) => {
    const cur = currentTime !== undefined ? currentTime : (el.videoAudioPlayer.currentTime || 0);
    // If no synced segments, provide draft bookText into captions layer
    const capLayer = scene.getLayer('layer_captions');
    if (capLayer && (!scene.syncedSegments || scene.syncedSegments.length === 0)) {
      capLayer.text = el.bookText.value.trim() ? el.bookText.value.trim().slice(0, 140) : '';
    }
    renderScene(canvasCtx, scene, {
      currentTime: cur,
      bgImage: state.video.bgImage
    });
  };

  const interactionMgr = new CanvasInteractionManager({
    stageEl: el.videoStageContainer || document.getElementById('video-stage-container'),
    containerEl: el.canvasContainer,
    canvasEl: el.videoCanvas,
    guidesEl: el.guidesCanvas || document.getElementById('guides-canvas'),
    selectionBoxEl: el.figmaSelectionBox,
    scene,
    history,
    onRender: () => renderVideoFrame(),
    onSelectionChange: (layer) => {
      renderLayersList();
      syncInspectorFromLayer();
    }
  });

  const panelMgr = new PanelManager({
    leftSidebarEl: document.getElementById('left-sidebar'),
    rightSidebarEl: document.getElementById('right-sidebar'),
    timelineEl: document.getElementById('capcut-timeline-container'),
    onResizeCanvas: () => {
      interactionMgr.fitToScreen();
    }
  });

  // Panel Toggle Shortcuts & Buttons
  if (el.btnToggleLeftNarrator) el.btnToggleLeftNarrator.addEventListener('click', () => panelMgr.toggleLeft());
  if (el.btnToggleRightNarrator) el.btnToggleRightNarrator.addEventListener('click', () => panelMgr.toggleRight());
  if (el.btnToggleLeftPanel) el.btnToggleLeftPanel.addEventListener('click', () => panelMgr.toggleLeft());
  if (el.btnToggleRightPanel) el.btnToggleRightPanel.addEventListener('click', () => panelMgr.toggleRight());
  if (el.btnToggleTimeline) el.btnToggleTimeline.addEventListener('click', () => panelMgr.toggleTimeline());
  if (el.btnZenMode) el.btnZenMode.addEventListener('click', () => panelMgr.toggleZenMode());

  // Zen Mode Play Button Integration
  const zenPlayBtn = document.getElementById('zen-play-btn');
  if (zenPlayBtn) zenPlayBtn.addEventListener('click', () => toggleVideoPlay());

  // =========================================================
  // FIGMA MULTI-LAYER ENGINE
  // =========================================================
  const getSelectedLayer = () => {
    return scene.getSelectedLayer();
  };

  const renderLayersList = () => {
    el.layersList.innerHTML = '';
    const selected = scene.getSelectedLayer();
    scene.layers.forEach(l => {
      const item = document.createElement('div');
      item.className = `layer-item ${selected && selected.id === l.id ? 'active' : ''}`;
      const icon = l.type === 'transcription' ? 'T' : (l.type === 'audio_widget' ? 'P' : 'T');
      item.innerHTML = `<span style="font-weight:700; opacity:0.6; font-size:11px;">${icon}</span><span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.name}</span>`;
      item.addEventListener('click', () => selectLayer(l.id));
      el.layersList.appendChild(item);
    });
  };

  const selectLayer = (layerId) => {
    scene.selectLayer(layerId);
    renderLayersList();
    syncInspectorFromLayer();
    interactionMgr.updateSelectionBox();
    renderVideoFrame();
  };

  // Sync Right Sidebar Inspector Fields to the active layer
  const syncInspectorFromLayer = () => {
    const l = getSelectedLayer();
    if (!l) {
      el.figmaSelectionBox.classList.add('hidden');
      el.customTextEditorGroup.classList.add('hidden');
      el.propPosX.value = '';
      el.propPosY.value = '';
      el.propSizeW.value = '';
      if (el.propSizeH) el.propSizeH.value = '';
      el.selectionTagName.textContent = '';
      return;
    }

    // Numerical coordinates in 1920x1080 canvas pixels
    el.propPosX.value = Math.round(l.x);
    el.propPosY.value = Math.round(l.y);
    el.propSizeW.value = Math.round(l.width);
    if (el.propSizeH) el.propSizeH.value = Math.round(l.height || 40);

    // Is it a custom text layer? Show content input and delete button
    if (l.type === 'text') {
      el.customTextEditorGroup.classList.remove('hidden');
      el.layerContentInput.value = l.text || '';
    } else {
      // Core Synced Captions and Player Widget have NO delete button and NO custom text input
      el.customTextEditorGroup.classList.add('hidden');
    }

    if (l.type === 'audio_widget') {
      el.typographySettingsGroup.classList.add('hidden');
      document.getElementById('alignment-settings-group').classList.add('hidden');
      document.getElementById('casing-settings-group').classList.add('hidden');
      document.getElementById('weight-settings-group').classList.add('hidden');
      el.togglePlayerWidget.checked = l.visible;
    } else {
      el.typographySettingsGroup.classList.remove('hidden');
      document.getElementById('alignment-settings-group').classList.remove('hidden');
      document.getElementById('casing-settings-group').classList.remove('hidden');
      document.getElementById('weight-settings-group').classList.remove('hidden');

      el.captionFontSelect.value = l.fontFamily || "'Merriweather', serif";
      el.captionSizeNum.value = l.fontSize || 54;
      el.captionColorPicker.value = l.fill || '#111827';

      el.alignBtns.forEach(b => b.classList.toggle('active', b.dataset.align === (l.align || 'left')));
      el.casingBtns.forEach(b => b.classList.toggle('active', b.dataset.casing === (l.casing || 'none') || (b.dataset.casing === 'normal' && l.casing === 'none') || (b.dataset.casing === 'lower' && l.casing === 'lower')));
      el.weightBtns.forEach(b => b.classList.toggle('active', b.dataset.weight === (String(l.fontWeight) || '700')));
    }

    el.selectionTagName.textContent = l.name;
    interactionMgr.updateSelectionBox();
  };

  // Add new independent Text Layer (T button)
  el.btnAddTextLayer.addEventListener('click', () => {
    const count = scene.layers.filter(l => l.type === 'text').length + 1;
    const newId = `layer_text_${Date.now()}`;
    const newLayer = new TextLayer({
      id: newId,
      name: `Text ${count}`,
      text: 'Subtitle Heading',
      x: 880,
      y: 380,
      width: 850,
      height: 80,
      fontFamily: "'Playfair Display', serif",
      fontSize: 44,
      fontWeight: '700',
      fill: '#111827',
      align: 'left'
    });
    scene.addLayer(newLayer);
    history.execute(new AddLayerCommand(scene, newLayer, () => {
      selectLayer(newId);
    }));
    selectLayer(newId);

    // Auto-focus and highlight the text input in inspector
    setTimeout(() => {
      if (el.layerContentInput) {
        el.layerContentInput.focus();
        el.layerContentInput.select();
      }
    }, 60);

    debouncedSaveDraft();
  });

  // Shortcut key T for adding text
  document.addEventListener('keydown', (e) => {
    if (currentMode === 'video' && e.key.toLowerCase() === 't' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      el.btnAddTextLayer.click();
    }
    if (currentMode === 'video' && e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      toggleVideoPlay();
    }
  });

  // Delete Layer (Only applies to custom text layers)
  el.btnDeleteLayer.addEventListener('click', () => {
    const l = getSelectedLayer();
    if (l && l.type === 'text') {
      const removedLayer = l;
      history.execute(new RemoveLayerCommand(scene, removedLayer, () => {
        selectLayer('layer_captions');
      }));
      selectLayer('layer_captions');
      debouncedSaveDraft();
    }
  });

  // Layer Content Edit (for custom text layers)
  el.layerContentInput.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l && l.type === 'text') {
      l.text = e.target.value;
      l.name = e.target.value.slice(0, 15) || 'Text Layer';
      measureTextLayout(canvasCtx, l);
      renderLayersList();
      interactionMgr.updateSelectionBox();
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  // Inspector Numerical Position & Size Inputs
  el.propPosX.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.x = parseInt(e.target.value) || 0;
      interactionMgr.updateSelectionBox();
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  el.propPosY.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.y = parseInt(e.target.value) || 0;
      interactionMgr.updateSelectionBox();
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  el.propSizeW.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.width = Math.max(50, Math.min(1920, parseInt(e.target.value) || 200));
      if (l.type === 'text' || l.type === 'transcription') {
        measureTextLayout(canvasCtx, l);
      }
      interactionMgr.updateSelectionBox();
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  if (el.propSizeH) {
    el.propSizeH.addEventListener('input', (e) => {
      const l = getSelectedLayer();
      if (l) {
        l.height = Math.max(20, Math.min(1080, parseInt(e.target.value) || 40));
        interactionMgr.updateSelectionBox();
        renderVideoFrame();
        debouncedSaveDraft();
      }
    });
  }

  // Typography Inputs
  el.captionSizeNum.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.fontSize = parseInt(e.target.value) || 54;
      if (l.type === 'text' || l.type === 'transcription') {
        measureTextLayout(canvasCtx, l);
      }
      interactionMgr.updateSelectionBox();
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  el.captionFontSelect.addEventListener('change', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.fontFamily = e.target.value;
      if (l.type === 'text' || l.type === 'transcription') {
        measureTextLayout(canvasCtx, l);
      }
      interactionMgr.updateSelectionBox();
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  el.captionColorPicker.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.fill = e.target.value;
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  el.colorPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelectedLayer();
      if (l) {
        l.fill = btn.dataset.color;
        el.captionColorPicker.value = btn.dataset.color;
        renderVideoFrame();
        debouncedSaveDraft();
      }
    });
  });

  el.alignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelectedLayer();
      if (l) {
        el.alignBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.align = btn.dataset.align;
        renderVideoFrame();
        debouncedSaveDraft();
      }
    });
  });

  el.casingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelectedLayer();
      if (l) {
        el.casingBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const casing = btn.dataset.casing === 'normal' ? 'none' : btn.dataset.casing;
        l.casing = casing;
        if (l.type === 'text' || l.type === 'transcription') {
          measureTextLayout(canvasCtx, l);
        }
        interactionMgr.updateSelectionBox();
        renderVideoFrame();
        debouncedSaveDraft();
      }
    });
  });

  el.weightBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelectedLayer();
      if (l) {
        el.weightBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.fontWeight = btn.dataset.weight;
        if (l.type === 'text' || l.type === 'transcription') {
          measureTextLayout(canvasCtx, l);
        }
        interactionMgr.updateSelectionBox();
        renderVideoFrame();
        debouncedSaveDraft();
      }
    });
  });

  el.togglePlayerWidget.addEventListener('change', (e) => {
    const widgetLayer = scene.getLayer('layer_player_widget');
    if (widgetLayer) {
      widgetLayer.visible = e.target.checked;
      renderVideoFrame();
      debouncedSaveDraft();
    }
  });

  // =========================================================
  // VIDEO CANVAS RENDERING
  // =========================================================
  const initVideoStudio = () => {
    if (!state.video.bgImage) {
      loadBackgroundTemplate('/templates/sample-book.jpg');
    } else {
      renderVideoFrame();
    }
    renderLayersList();
    selectLayer('layer_captions');
  };

  const loadBackgroundTemplate = (url) => {
    const img = new Image();
    img.onload = () => {
      state.video.bgImage = img;
      state.video.bgImageLoaded = true;
      renderVideoFrame();
    };
    img.onerror = () => {
      console.warn('Could not load background template:', url);
    };
    img.src = url;
  };

  el.bgImageUploader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => loadBackgroundTemplate(event.target.result);
    reader.readAsDataURL(file);
  });

  el.btnSampleTemplate.addEventListener('click', () => {
    loadBackgroundTemplate('/templates/sample-book.jpg');
  });

  // =========================================================
  // CAPCUT-STYLE MULTI-TRACK TIMELINE ENGINE
  // =========================================================

  const buildTimelineRulerAndTracks = () => {
    const dur = el.videoAudioPlayer.duration || 10;
    el.timelineRuler.innerHTML = '';
    el.laneSubtitles.innerHTML = '';

    // Step every 2 seconds
    const step = dur > 60 ? 10 : (dur > 20 ? 5 : 2);
    for (let t = 0; t <= dur + step; t += step) {
      const tick = document.createElement('div');
      tick.className = 'ruler-tick';
      const pct = (t / dur) * 100;
      tick.style.left = `${pct}%`;
      tick.textContent = formatDuration(t);
      el.timelineRuler.appendChild(tick);
    }

    // Render subtitle blocks on Track 1
    state.video.syncedSegments.forEach((seg, idx) => {
      const block = document.createElement('div');
      block.className = 'caption-block';
      const startPct = (seg.start / dur) * 100;
      const widthPct = ((seg.end - seg.start) / dur) * 100;
      block.style.left = `${startPct}%`;
      block.style.width = `${Math.max(2, widthPct)}%`;
      block.textContent = seg.text;
      block.title = seg.text;
      block.dataset.idx = idx;
      el.laneSubtitles.appendChild(block);
    });
  };

  // Timeline Click / Scrubbing
  el.timelineViewport.addEventListener('click', (e) => {
    const rect = el.timelineViewport.getBoundingClientRect();
    const trackOffsetX = 90; // header width
    const clickX = e.clientX - rect.left - trackOffsetX;
    const laneWidth = rect.width - trackOffsetX;
    if (clickX >= 0 && laneWidth > 0) {
      const dur = el.videoAudioPlayer.duration || 10;
      const targetTime = Math.max(0, Math.min(dur, (clickX / laneWidth) * dur));
      el.videoAudioPlayer.currentTime = targetTime;
      updatePlayheadPosition(targetTime, dur);
      renderVideoFrame(targetTime);
    }
  });

  const updatePlayheadPosition = (cur, dur) => {
    const laneWidth = el.timelineViewport.clientWidth - 90;
    const pct = Math.min(1, Math.max(0, cur / (dur || 1)));
    const leftPx = 90 + (pct * laneWidth);
    el.timelinePlayhead.style.left = `${leftPx}px`;
    el.videoTimecode.textContent = `${formatTimecode(cur)} / ${formatTimecode(dur)}`;

    const zenTimecode = document.getElementById('zen-timecode');
    if (zenTimecode) zenTimecode.textContent = `${formatTimecode(cur)} / ${formatTimecode(dur)}`;

    // Highlight active subtitle block on timeline
    const blocks = el.laneSubtitles.querySelectorAll('.caption-block');
    state.video.syncedSegments.forEach((seg, i) => {
      if (blocks[i]) {
        blocks[i].classList.toggle('active', cur >= seg.start && cur <= seg.end);
      }
    });
  };

  // CapCut Audio Speed Buttons
  el.speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const spd = parseFloat(btn.dataset.speed);
      state.video.audioSpeed = spd;
      el.videoAudioPlayer.playbackRate = spd;
      debouncedSaveDraft();
    });
  });

  // Transport Controls
  const toggleVideoPlay = () => {
    if (!el.videoAudioPlayer.src) {
      showToast('Please select or generate a narration project first.', 'error');
      return;
    }

    if (!el.videoAudioPlayer.paused) {
      el.videoAudioPlayer.pause();
      state.video.isPlaying = false;
      el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    } else {
      el.videoAudioPlayer.playbackRate = state.video.audioSpeed;
      const playPromise = el.videoAudioPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          state.video.isPlaying = true;
          el.videoPlaySvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          requestAnimationFrame(capcutAnimationLoop);
        }).catch(err => {
          console.error("Audio playback error:", err);
          showToast("Audio error: Click on the page or select a chapter to enable audio playback.", 'error');
        });
      }
    }
  };

  el.btnVideoPlay.addEventListener('click', toggleVideoPlay);

  // Sync state if audio is played or paused from native controls
  el.videoAudioPlayer.addEventListener('play', () => {
    state.video.isPlaying = true;
    el.videoPlaySvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    requestAnimationFrame(capcutAnimationLoop);
  });

  el.videoAudioPlayer.addEventListener('pause', () => {
    state.video.isPlaying = false;
    el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  });

  el.btnVideoStop.addEventListener('click', () => {
    el.videoAudioPlayer.pause();
    el.videoAudioPlayer.currentTime = 0;
    state.video.isPlaying = false;
    el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    updatePlayheadPosition(0, el.videoAudioPlayer.duration || 1);
    renderVideoFrame(0);
  });

  const capcutAnimationLoop = () => {
    if (!state.video.isPlaying && !state.video.isExporting) return;
    const cur = el.videoAudioPlayer.currentTime;
    const dur = el.videoAudioPlayer.duration || 1;

    renderVideoFrame(cur);
    updatePlayheadPosition(cur, dur);

    if (cur >= dur) {
      state.video.isPlaying = false;
      el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      return;
    }
    requestAnimationFrame(capcutAnimationLoop);
  };

  el.videoAudioPlayer.addEventListener('loadedmetadata', () => {
    buildTimelineRulerAndTracks();
    updatePlayheadPosition(0, el.videoAudioPlayer.duration);
  });

  el.videoAudioPlayer.addEventListener('ended', () => {
    state.video.isPlaying = false;
    el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    updatePlayheadPosition(0, el.videoAudioPlayer.duration || 1);
    renderVideoFrame(0);
  });

  // MP4 Video Exporter
  el.btnExportMp4.addEventListener('click', async () => {
    if (!el.videoAudioPlayer.src) {
      showToast('Please load an audio project first.', 'error');
      return;
    }

    state.video.isExporting = true;
    el.btnExportMp4.disabled = true;
    el.exportBtnLabel.textContent = 'Recording MP4...';

    // Hide Figma selection handles during export
    el.figmaSelectionBox.classList.add('hidden');
    el.videoAudioPlayer.pause();
    el.videoAudioPlayer.currentTime = 0;

    try {
      const stream = el.videoCanvas.captureStream(30);
      
      // Use an isolated audio instance for recording so the master player is NEVER hijacked or muted
      const exportAudio = new Audio(state.activeSession.audio_url);
      exportAudio.crossOrigin = 'anonymous';
      exportAudio.playbackRate = state.video.audioSpeed;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(exportAudio);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);

      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
        ? 'video/mp4;codecs=avc1'
        : (MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm');

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 6000000 });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (state.activeSession?.title || 'youtube_book_automation').replace(/[^a-z0-9_-]/gi, '_');
        a.download = `${filename}.${ext}`;
        a.click();

        el.figmaSelectionBox.classList.remove('hidden');
        el.btnExportMp4.disabled = false;
        el.exportBtnLabel.textContent = 'Export MP4';
        state.video.isExporting = false;
        exportAudio.pause();
        audioCtx.close().catch(() => {});
        showToast(`Video successfully exported as ${filename}.${ext}!`, 'success');
      };

      recorder.start();
      await exportAudio.play();
      state.video.isPlaying = true;

      // Sync canvas animation with export audio
      const exportSyncLoop = () => {
        if (!state.video.isExporting) return;
        const cur = exportAudio.currentTime;
        const dur = exportAudio.duration || 1;
        renderVideoFrame(cur);
        updatePlayheadPosition(cur, dur);
        if (cur < dur) {
          requestAnimationFrame(exportSyncLoop);
        }
      };
      requestAnimationFrame(exportSyncLoop);

      exportAudio.onended = () => {
        recorder.stop();
      };
    } catch (err) {
      showToast(`Export error: ${err.message}`, 'error');
      el.figmaSelectionBox.classList.remove('hidden');
      el.btnExportMp4.disabled = false;
      el.exportBtnLabel.textContent = 'Export MP4';
      state.video.isExporting = false;
    }
  });

  // =========================================================
  // NARRATION & SESSION RESTORATION
  // =========================================================
  const selectSession = (sess) => {
    state.activeSession = sess;
    el.projectTitle.value = sess.title;
    el.bookText.value = sess.text;
    updateStats();

    // Show audio deck in Narrator view
    el.audioDeck.classList.remove('hidden');
    el.deckTitle.textContent = sess.title;
    el.deckSubtitle.textContent = `${sess.word_count.toLocaleString()} words • ${formatDuration(sess.duration_seconds)}`;
    // Master audio setup (shared between Narrator deck & Video Studio)
    el.mainAudioPlayer.src = sess.audio_url;
    el.mainAudioPlayer.load(); // Forces immediate browser audio decode
    el.btnDownloadAudio.href = sess.audio_url;
    el.btnDownloadAudio.setAttribute('download', `${sess.title.replace(/[^a-z0-9_-]/gi, '_')}.wav`);

    // Sync into Video Studio
    el.videoProjectName.textContent = sess.title;

    // Build timeline subtitle segments
    buildSyncedSegments(sess.text, sess.duration_seconds);

    renderHistoryList();
    if (currentMode === 'video') {
      buildTimelineRulerAndTracks();
      renderVideoFrame(0);
    }
  };

  const buildSyncedSegments = (text, totalDuration) => {
    const clean = text.replace(/^[ \t]*#{1,6}\s+/gm, '').replace(/[*_`]/g, '').trim();
    const rawSentences = clean.match(/[^.!?\n]+[.!?\n]*/g) || [clean];
    const sentences = rawSentences.map(s => s.trim()).filter(Boolean);

    if (sentences.length === 0 || !totalDuration) {
      state.video.syncedSegments = [{ start: 0, end: totalDuration || 10, text: text }];
      scene.syncedSegments = state.video.syncedSegments;
      scene.duration = totalDuration || 10;
      return;
    }

    const totalChars = sentences.reduce((acc, s) => acc + s.length, 0);
    let currentStart = 0;
    state.video.syncedSegments = sentences.map(s => {
      const frac = s.length / Math.max(1, totalChars);
      const segDur = frac * totalDuration;
      const seg = { start: currentStart, end: currentStart + segDur, text: s };
      currentStart += segDur;
      return seg;
    });
    scene.syncedSegments = state.video.syncedSegments;
    scene.duration = totalDuration;
  };

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      state.sessions = await res.json();
      renderHistoryList();
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  const renderHistoryList = () => {
    el.sessionCountBadge.textContent = state.sessions.length;
    if (state.sessions.length === 0) {
      el.historyList.innerHTML = `<div class="history-empty"><p>No past narrations yet.</p></div>`;
      return;
    }

    el.historyList.innerHTML = '';
    state.sessions.forEach(sess => {
      const item = document.createElement('div');
      item.className = `history-item ${(state.activeSession && sess.id === state.activeSession.id) ? 'active' : ''}`;
      item.innerHTML = `
        <div class="history-item-top">
          <span class="history-item-title">${sess.title}</span>
          <button class="btn-delete-session" title="Delete" data-id="${sess.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <div class="history-item-meta">
          <span>${sess.word_count.toLocaleString()} words</span>
          <span>•</span>
          <span>${formatDuration(sess.duration_seconds)}</span>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-session')) return;
        selectSession(sess);
      });

      const delBtn = item.querySelector('.btn-delete-session');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${sess.title}"?`)) {
          await fetch('/api/sessions/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sess.id })
          });
          if (state.activeSession && state.activeSession.id === sess.id) state.activeSession = null;
          loadSessions();
        }
      });

      el.historyList.appendChild(item);
    });
  };

  // Narration Voice & Generation Setup
  const initializeEngines = async () => {
    try {
      const [voicesRes, statusRes] = await Promise.all([
        fetch('/api/voices').then(r => r.json()),
        fetch('/api/status').then(r => r.json())
      ]);
      state.voices = voicesRes;
      renderVoices();
      if (statusRes.local_model_ready) {
        el.engineStatusDot.classList.add('ready');
        el.engineStatusText.textContent = 'Kokoro-82M Ready (Local)';
      }
    } catch (e) {}
  };

  const renderVoices = () => {
    const list = state.voices[state.engine] || [];
    el.voiceSelect.innerHTML = '';
    list.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      if (v.default || v.id === state.selectedVoice) {
        opt.selected = true;
        state.selectedVoice = v.id;
      }
      el.voiceSelect.appendChild(opt);
    });
    updateVoiceDescription();
  };

  const updateVoiceDescription = () => {
    const list = state.voices[state.engine] || [];
    const current = list.find(v => v.id === el.voiceSelect.value);
    el.voiceDesc.textContent = (current && current.description) ? current.description : 'High fidelity neural narration';
    state.selectedVoice = el.voiceSelect.value;
  };

  el.engineTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      state.engine = tab.dataset.engine;
      el.engineTabs.forEach(t => t.classList.toggle('active', t.dataset.engine === state.engine));
      el.panelDeployedSettings.classList.toggle('hidden', state.engine !== 'deployed');
      el.panelCloudSettings.classList.toggle('hidden', state.engine !== 'cloud_api');
      renderVoices();
      debouncedSaveDraft();
    });
  });

  el.voiceSelect.addEventListener('change', () => {
    updateVoiceDescription();
    debouncedSaveDraft();
  });

  el.speedSlider.addEventListener('input', (e) => {
    state.speed = parseFloat(e.target.value);
    el.speedVal.textContent = `${state.speed.toFixed(2)}x`;
    updateStats();
    debouncedSaveDraft();
  });

  el.pauseParaSlider.addEventListener('input', (e) => {
    state.paragraphPause = parseFloat(e.target.value);
    el.pauseParaVal.textContent = `${state.paragraphPause.toFixed(1)}s`;
    debouncedSaveDraft();
  });

  el.pauseSentSlider.addEventListener('input', (e) => {
    state.sentencePause = parseFloat(e.target.value);
    el.pauseSentVal.textContent = `${state.sentencePause.toFixed(2)}s`;
    debouncedSaveDraft();
  });

  // Generate Narration Stream
  el.btnGenerate.addEventListener('click', async () => {
    const text = el.bookText.value.trim();
    if (!text) {
      showToast('Please enter or paste book text to narrate.', 'error');
      return;
    }

    state.isGenerating = true;
    el.btnGenerate.disabled = true;
    el.btnGenerateLabel.textContent = 'Generating Audio...';
    el.progressCard.classList.remove('hidden');
    el.audioDeck.classList.add('hidden');

    el.progressBarFill.style.width = '0%';
    el.progressChunkInfo.textContent = 'Starting...';
    el.progressEta.textContent = 'ETA: Calculating...';
    el.progressSnippetText.textContent = 'Filtering Markdown and chunking sentences...';

    const payload = {
      title: el.projectTitle.value.trim(),
      text: text,
      engine: state.engine,
      voice: el.voiceSelect.value,
      speed: state.speed,
      paragraph_pause: state.paragraphPause,
      sentence_pause: state.sentencePause,
      endpoint_url: el.deployedEndpoint.value.trim(),
      api_key: state.engine === 'deployed' ? el.deployedToken.value.trim() : el.cloudApiKey.value.trim(),
      instruction: el.deployedInstruction.value.trim(),
      cloud_provider: el.cloudProvider.value
    };

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await response.text());

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.replace('data: ', '').trim();
          if (!jsonStr) continue;

          const data = JSON.parse(jsonStr);
          if (data.status === 'progress') {
            el.progressBarFill.style.width = `${data.percent}%`;
            el.progressChunkInfo.textContent = `Chunk ${data.current_chunk} / ${data.total_chunks} (${data.percent}%)`;
            el.progressEta.textContent = `ETA: ${data.eta_seconds}s`;
            el.progressSnippetText.textContent = data.current_text;
          } else if (data.status === 'stitching') {
            el.progressBarFill.style.width = `98%`;
            el.progressStatusTitle.textContent = 'Finalizing Audio...';
            el.progressSnippetText.textContent = data.message;
          } else if (data.status === 'completed') {
            el.progressBarFill.style.width = `100%`;
            el.progressCard.classList.add('hidden');
            await loadSessions();
            selectSession(data.session);
            el.mainAudioPlayer.play().catch(() => {});
          } else if (data.status === 'error') {
            throw new Error(data.error);
          }
        }
      }
    } catch (err) {
      showToast(`Generation failed: ${err.message}`, 'error');
      el.progressCard.classList.add('hidden');
    } finally {
      state.isGenerating = false;
      el.btnGenerate.disabled = false;
      el.btnGenerateLabel.textContent = 'Generate Narration';
    }
  });

  el.btnNewProject.addEventListener('click', () => {
    state.activeSession = null;
    el.projectTitle.value = '';
    el.bookText.value = '';
    el.audioDeck.classList.add('hidden');
    el.progressCard.classList.add('hidden');
    updateStats();
    renderHistoryList();
    setMode('narration');
    localStorage.removeItem('book_narrator_draft_buffer');
    fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', text: '', layers: null })
    }).catch(() => {});
    if (el.autosaveStatus) el.autosaveStatus.textContent = 'New Project';
    el.bookText.focus();
  });

  el.fileUploader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!el.projectTitle.value.trim()) {
      el.projectTitle.value = file.name.replace(/\.[^/.]+$/, '');
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      el.bookText.value = event.target.result;
      updateStats();
      debouncedSaveDraft();
    };
    reader.readAsText(file);
  });

  // Voice Preview
  el.btnPreviewVoice.addEventListener('click', async () => {
    el.btnPreviewVoice.disabled = true;
    const txt = el.btnPreviewVoice.querySelector('span');
    const orig = txt.textContent;
    txt.textContent = 'Loading...';

    const payload = {
      engine: state.engine,
      voice: el.voiceSelect.value,
      speed: state.speed,
      endpoint_url: el.deployedEndpoint.value.trim(),
      api_key: state.engine === 'deployed' ? el.deployedToken.value.trim() : el.cloudApiKey.value.trim(),
      instruction: el.deployedInstruction.value.trim(),
      cloud_provider: el.cloudProvider.value
    };

    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.audio_url) {
        el.previewAudioPlayer.src = data.audio_url;
        el.previewAudioPlayer.play();
      }
    } catch (err) {
      showToast(`Preview error: ${err.message}`, 'error');
    } finally {
      el.btnPreviewVoice.disabled = false;
      txt.textContent = orig;
    }
  });

  // Init
  const init = async () => {
    try {
      await initializeEngines();
    } catch (e) {
      console.error('Error initializing engines:', e);
    }
    try {
      await restoreDraft();
    } catch (e) {
      console.error('Error restoring draft:', e);
    }
    try {
      await loadSessions();
      if (state.sessions.length > 0 && !state.activeSession) {
        selectSession(state.sessions[0]);
      }
    } catch (e) {
      console.error('Error loading sessions:', e);
    }
    initVideoStudio();
    updateStats();
  };
  init();
});
