/**
 * AI Book Narrator & CapCut/Figma Video Studio
 * Multi-layer frames, dynamic typography, CapCut timeline & audio speed control.
 */

document.addEventListener('DOMContentLoaded', () => {
  let currentMode = 'narration';

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

    // Video Studio & Multi-layer Figma System
    video: {
      bgImage: null,
      bgImageLoaded: false,
      audioSpeed: 1.0,
      isPlaying: false,
      isExporting: false,
      selectedLayerId: 'layer_captions',
      syncedSegments: [],
      
      // Layers (Figma independent frames)
      layers: [
        {
          id: 'layer_captions',
          type: 'transcription',
          name: 'Synced Captions',
          x: 0.46,
          y: 0.22,
          width: 0.48,
          font: "'Merriweather', serif",
          size: 54,
          color: '#111827',
          weight: '700',
          align: 'left',
          casing: 'lower'
        },
        {
          id: 'layer_player_widget',
          type: 'player_widget',
          name: 'Audio Player Bar',
          x: 0.44,
          y: 0.68,
          width: 0.49,
          color: '#111827',
          enabled: true
        }
      ]
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

    // Video Studio & Figma Canvas
    videoCanvas: document.getElementById('video-canvas'),
    canvasContainer: document.getElementById('canvas-container'),
    figmaSelectionBox: document.getElementById('figma-selection-box'),
    selectionTagName: document.getElementById('selection-tag-name'),
    bgImageUploader: document.getElementById('bg-image-uploader'),
    btnSampleTemplate: document.getElementById('btn-sample-template'),
    btnAddTextLayer: document.getElementById('btn-add-text-layer'),
    videoAudioPlayer: document.getElementById('video-audio-player'),
    btnExportMp4: document.getElementById('btn-export-mp4'),
    exportBtnLabel: document.getElementById('export-btn-label'),
    videoProjectName: document.getElementById('video-project-name'),

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

      if (!state.activeSession && state.sessions.length > 0) {
        selectSession(state.sessions[0]);
      }
      initVideoStudio();
    }
  };

  el.tabModeNarration.addEventListener('click', () => setMode('narration'));
  el.tabModeVideo.addEventListener('click', () => setMode('video'));
  el.btnOpenInVideoStudio.addEventListener('click', () => setMode('video'));

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
  // FIGMA MULTI-LAYER ENGINE
  // =========================================================
  const getSelectedLayer = () => {
    return state.video.layers.find(l => l.id === state.video.selectedLayerId) || state.video.layers[0];
  };

  const renderLayersList = () => {
    el.layersList.innerHTML = '';
    state.video.layers.forEach(l => {
      const item = document.createElement('div');
      item.className = `layer-item ${l.id === state.video.selectedLayerId ? 'active' : ''}`;
      const icon = l.type === 'transcription' ? '📝' : (l.type === 'player_widget' ? '🎵' : '🔤');
      item.innerHTML = `<span>${icon}</span><span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.name}</span>`;
      item.addEventListener('click', () => selectLayer(l.id));
      el.layersList.appendChild(item);
    });
  };

  const selectLayer = (layerId) => {
    state.video.selectedLayerId = layerId;
    renderLayersList();
    syncInspectorFromLayer();
    updateFigmaSelectionBox();
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  };

  // Sync Right Sidebar Inspector Fields to the active layer
  const syncInspectorFromLayer = () => {
    const l = getSelectedLayer();
    if (!l) return;

    // Numerical coordinates (mapped to 1920x1080 canvas pixels)
    el.propPosX.value = Math.round(l.x * 1920);
    el.propPosY.value = Math.round(l.y * 1080);
    el.propSizeW.value = Math.round(l.width * 1920);

    // Is it a custom text layer? Show content input
    if (l.type === 'text') {
      el.customTextEditorGroup.classList.remove('hidden');
      el.layerContentInput.value = l.text || 'Text Layer';
      el.btnDeleteLayer.disabled = false;
      el.btnDeleteLayer.style.display = 'block';
    } else {
      el.customTextEditorGroup.classList.add('hidden');
      // Do not allow deleting core captions or player bar
      el.btnDeleteLayer.style.display = (l.type === 'transcription' || l.type === 'player_widget') ? 'none' : 'block';
    }

    if (l.type === 'player_widget') {
      el.typographySettingsGroup.classList.add('hidden');
      document.getElementById('alignment-settings-group').classList.add('hidden');
      document.getElementById('casing-settings-group').classList.add('hidden');
      document.getElementById('weight-settings-group').classList.add('hidden');
    } else {
      el.typographySettingsGroup.classList.remove('hidden');
      document.getElementById('alignment-settings-group').classList.remove('hidden');
      document.getElementById('casing-settings-group').classList.remove('hidden');
      document.getElementById('weight-settings-group').classList.remove('hidden');

      el.captionFontSelect.value = l.font || "'Merriweather', serif";
      el.captionSizeNum.value = l.size || 54;
      el.captionColorPicker.value = l.color || '#111827';

      el.alignBtns.forEach(b => b.classList.toggle('active', b.dataset.align === (l.align || 'left')));
      el.casingBtns.forEach(b => b.classList.toggle('active', b.dataset.casing === (l.casing || 'lower')));
      el.weightBtns.forEach(b => b.classList.toggle('active', b.dataset.weight === (l.weight || '700')));
    }

    el.selectionTagName.textContent = l.name;
  };

  // Update position of Figma Selection Bounding Box on canvas
  const updateFigmaSelectionBox = () => {
    const l = getSelectedLayer();
    if (!l) {
      el.figmaSelectionBox.classList.add('hidden');
      return;
    }

    el.figmaSelectionBox.classList.remove('hidden');
    el.figmaSelectionBox.style.left = `${l.x * 100}%`;
    el.figmaSelectionBox.style.top = `${l.y * 100}%`;
    el.figmaSelectionBox.style.width = `${l.width * 100}%`;
    
    // Height adapts based on layer type
    const heightPercent = l.type === 'player_widget' ? 12 : (l.size ? (l.size * 2.8 / 1080) * 100 : 15);
    el.figmaSelectionBox.style.height = `${Math.max(8, heightPercent)}%`;
  };

  // Add new independent Text Layer (T button)
  el.btnAddTextLayer.addEventListener('click', () => {
    const newId = `layer_text_${Date.now()}`;
    const newLayer = {
      id: newId,
      type: 'text',
      name: `Text ${state.video.layers.filter(l => l.type === 'text').length + 1}`,
      text: 'Subtitle Heading',
      x: 0.46,
      y: 0.12,
      width: 0.45,
      font: "'Playfair Display', serif",
      size: 44,
      color: '#111827',
      weight: '700',
      align: 'left',
      casing: 'normal'
    };
    state.video.layers.push(newLayer);
    selectLayer(newId);
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

  // Delete Layer
  el.btnDeleteLayer.addEventListener('click', () => {
    const l = getSelectedLayer();
    if (l && l.type === 'text') {
      state.video.layers = state.video.layers.filter(x => x.id !== l.id);
      selectLayer('layer_captions');
    }
  });

  // Layer Content Edit (for custom text layers)
  el.layerContentInput.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l && l.type === 'text') {
      l.text = e.target.value;
      l.name = e.target.value.slice(0, 15) || 'Text Layer';
      renderLayersList();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  // Inspector Numerical Position & Size Inputs
  el.propPosX.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.x = Math.max(0, Math.min(1920, parseInt(e.target.value) || 0)) / 1920;
      updateFigmaSelectionBox();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  el.propPosY.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.y = Math.max(0, Math.min(1080, parseInt(e.target.value) || 0)) / 1080;
      updateFigmaSelectionBox();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  el.propSizeW.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.width = Math.max(100, Math.min(1920, parseInt(e.target.value) || 200)) / 1920;
      updateFigmaSelectionBox();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  // Typography Inputs
  el.captionSizeNum.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.size = parseInt(e.target.value) || 54;
      updateFigmaSelectionBox();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  el.captionFontSelect.addEventListener('change', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.font = e.target.value;
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  el.captionColorPicker.addEventListener('input', (e) => {
    const l = getSelectedLayer();
    if (l) {
      l.color = e.target.value;
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  el.colorPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelectedLayer();
      if (l) {
        l.color = btn.dataset.color;
        el.captionColorPicker.value = btn.dataset.color;
        renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
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
        renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
      }
    });
  });

  el.casingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelectedLayer();
      if (l) {
        el.casingBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.casing = btn.dataset.casing;
        renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
      }
    });
  });

  el.weightBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const l = getSelectedLayer();
      if (l) {
        el.weightBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        l.weight = btn.dataset.weight;
        renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
      }
    });
  });

  el.togglePlayerWidget.addEventListener('change', (e) => {
    const widgetLayer = state.video.layers.find(l => l.type === 'player_widget');
    if (widgetLayer) {
      widgetLayer.enabled = e.target.checked;
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  });

  // Canvas Dragging of the Figma Bounding Box
  let isDraggingLayer = false;
  let dragOriginX, dragOriginY, initialLX, initialLY;

  el.figmaSelectionBox.addEventListener('mousedown', (e) => {
    isDraggingLayer = true;
    dragOriginX = e.clientX;
    dragOriginY = e.clientY;
    const l = getSelectedLayer();
    initialLX = l.x;
    initialLY = l.y;
    document.addEventListener('mousemove', onLayerDragMove);
    document.addEventListener('mouseup', onLayerDragEnd);
  });

  const onLayerDragMove = (e) => {
    if (!isDraggingLayer) return;
    const containerRect = el.canvasContainer.getBoundingClientRect();
    const deltaX = (e.clientX - dragOriginX) / containerRect.width;
    const deltaY = (e.clientY - dragOriginY) / containerRect.height;

    const l = getSelectedLayer();
    if (l) {
      l.x = Math.max(0.02, Math.min(0.95 - l.width, initialLX + deltaX));
      l.y = Math.max(0.02, Math.min(0.95, initialLY + deltaY));
      el.propPosX.value = Math.round(l.x * 1920);
      el.propPosY.value = Math.round(l.y * 1080);
      updateFigmaSelectionBox();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
  };

  const onLayerDragEnd = () => {
    isDraggingLayer = false;
    document.removeEventListener('mousemove', onLayerDragMove);
    document.removeEventListener('mouseup', onLayerDragEnd);
  };

  // =========================================================
  // VIDEO CANVAS RENDERING
  // =========================================================
  const initVideoStudio = () => {
    if (!state.video.bgImage) {
      loadBackgroundTemplate('/templates/sample-book.jpg');
    } else {
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
    renderLayersList();
    selectLayer('layer_captions');
  };

  const loadBackgroundTemplate = (url) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      state.video.bgImage = img;
      state.video.bgImageLoaded = true;
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    };
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

  const getActiveCaptionText = (time) => {
    if (state.video.syncedSegments.length === 0) {
      return (el.bookText.value.trim() || 'let me say that again your emotions are not your friend').slice(0, 140);
    }
    const current = state.video.syncedSegments.find(s => time >= s.start && time <= s.end);
    return current ? current.text : (state.video.syncedSegments[0]?.text || '');
  };

  const formatTextCasing = (str, casing) => {
    if (casing === 'lower') return str.toLowerCase();
    if (casing === 'upper') return str.toUpperCase();
    return str;
  };

  // Master Render Frame Function (draws Background, Player Widget, and all Text Layers)
  const renderVideoFrame = (currentTime) => {
    const width = 1920;
    const height = 1080;
    canvasCtx.clearRect(0, 0, width, height);

    // 1. Background Image
    if (state.video.bgImageLoaded && state.video.bgImage) {
      canvasCtx.drawImage(state.video.bgImage, 0, 0, width, height);
    } else {
      canvasCtx.fillStyle = '#C85A32';
      canvasCtx.fillRect(0, 0, width, height);
    }

    const duration = el.videoAudioPlayer.duration || 1;
    const progress = Math.min(1, Math.max(0, currentTime / duration));

    // 2. Render Each Layer in Order
    state.video.layers.forEach(layer => {
      if (layer.type === 'player_widget') {
        if (layer.enabled) drawAestheticAudioWidget(canvasCtx, progress, width, height, layer);
      } else if (layer.type === 'transcription') {
        const textToRender = formatTextCasing(getActiveCaptionText(currentTime), layer.casing);
        drawTextLayer(canvasCtx, textToRender, width, height, layer);
      } else if (layer.type === 'text') {
        const textToRender = formatTextCasing(layer.text || 'Text', layer.casing);
        drawTextLayer(canvasCtx, textToRender, width, height, layer);
      }
    });
  };

  // Draw Text Layer with Word Wrapping & Alignment
  const drawTextLayer = (ctx, text, canvasW, canvasH, layer) => {
    if (!text) return;
    ctx.save();
    ctx.font = `${layer.weight || 700} ${layer.size || 54}px ${layer.font || "'Merriweather', serif"}`;
    ctx.fillStyle = layer.color || '#111827';
    ctx.textBaseline = 'top';

    const maxLineWidth = canvasW * (layer.width || 0.45);
    const startX = canvasW * layer.x;
    const startY = canvasH * layer.y;
    const lineHeight = (layer.size || 54) * 1.35;

    const words = text.split(' ');
    let lines = [];
    let curLine = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = curLine + words[n] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxLineWidth && n > 0) {
        lines.push(curLine.trim());
        curLine = words[n] + ' ';
      } else {
        curLine = testLine;
      }
    }
    lines.push(curLine.trim());

    lines.forEach((l, idx) => {
      let lineX = startX;
      if (layer.align === 'center') {
        const w = ctx.measureText(l).width;
        lineX = startX + (maxLineWidth - w) / 2;
      } else if (layer.align === 'right') {
        const w = ctx.measureText(l).width;
        lineX = startX + (maxLineWidth - ctx.measureText(l).width);
      }
      ctx.fillText(l, lineX, startY + (idx * lineHeight));
    });
    ctx.restore();
  };

  // Aesthetic Audio Player Bar Overlay
  const drawAestheticAudioWidget = (ctx, progress, canvasW, canvasH, layer) => {
    const startX = canvasW * layer.x;
    const barWidth = canvasW * layer.width;
    const endX = startX + barWidth;
    const barY = canvasH * layer.y;
    const currentX = startX + (barWidth * progress);

    ctx.save();
    ctx.strokeStyle = layer.color || '#111827';
    ctx.fillStyle = layer.color || '#111827';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    // Horizontal track line
    ctx.beginPath();
    ctx.moveTo(startX, barY);
    ctx.lineTo(endX, barY);
    ctx.stroke();

    // Progress dot
    ctx.beginPath();
    ctx.arc(currentX, barY, 18, 0, Math.PI * 2);
    ctx.fill();

    // Transport Icons: <<  || / >  >>
    const iconCenterY = barY + 75;
    const centerX = startX + (barWidth / 2);

    // Prev <<
    const prevX = centerX - 120;
    ctx.beginPath();
    ctx.moveTo(prevX + 15, iconCenterY - 20); ctx.lineTo(prevX - 15, iconCenterY); ctx.lineTo(prevX + 15, iconCenterY + 20); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(prevX - 5, iconCenterY - 20); ctx.lineTo(prevX - 35, iconCenterY); ctx.lineTo(prevX - 5, iconCenterY + 20); ctx.fill();

    // Play/Pause
    if (state.video.isPlaying) {
      ctx.fillRect(centerX - 16, iconCenterY - 24, 10, 48);
      ctx.fillRect(centerX + 6, iconCenterY - 24, 10, 48);
    } else {
      ctx.beginPath();
      ctx.moveTo(centerX - 15, iconCenterY - 24); ctx.lineTo(centerX + 22, iconCenterY); ctx.lineTo(centerX - 15, iconCenterY + 24); ctx.fill();
    }

    // Next >>
    const nextX = centerX + 120;
    ctx.beginPath();
    ctx.moveTo(nextX - 15, iconCenterY - 20); ctx.lineTo(nextX + 15, iconCenterY); ctx.lineTo(nextX - 15, iconCenterY + 20); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nextX + 5, iconCenterY - 20); ctx.lineTo(nextX + 35, iconCenterY); ctx.lineTo(nextX + 5, iconCenterY + 20); ctx.fill();

    ctx.restore();
  };

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
    });
  });

  // Transport Controls
  const toggleVideoPlay = () => {
    if (!el.videoAudioPlayer.src) {
      alert('Please select or generate a narration project first.');
      return;
    }

    if (state.video.isPlaying) {
      el.videoAudioPlayer.pause();
      state.video.isPlaying = false;
      el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    } else {
      el.videoAudioPlayer.playbackRate = state.video.audioSpeed;
      el.videoAudioPlayer.play();
      state.video.isPlaying = true;
      el.videoPlaySvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      requestAnimationFrame(capcutAnimationLoop);
    }
  };

  el.btnVideoPlay.addEventListener('click', toggleVideoPlay);

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
      alert('Please load an audio project first.');
      return;
    }

    state.video.isExporting = true;
    el.btnExportMp4.disabled = true;
    el.exportBtnLabel.textContent = 'Recording MP4...';

    // Hide Figma selection handles during export
    el.figmaSelectionBox.classList.add('hidden');
    el.videoAudioPlayer.currentTime = 0;

    try {
      const stream = el.videoCanvas.captureStream(30);
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(el.videoAudioPlayer);
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
        alert(`Video successfully exported as ${filename}.${ext}!`);
      };

      recorder.start();
      el.videoAudioPlayer.playbackRate = state.video.audioSpeed;
      await el.videoAudioPlayer.play();
      state.video.isPlaying = true;
      requestAnimationFrame(capcutAnimationLoop);

      el.videoAudioPlayer.onended = () => {
        recorder.stop();
        audioCtx.close();
      };
    } catch (err) {
      alert(`Export error: ${err.message}`);
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
    el.mainAudioPlayer.src = sess.audio_url;
    el.btnDownloadAudio.href = sess.audio_url;
    el.btnDownloadAudio.setAttribute('download', `${sess.title.replace(/[^a-z0-9_-]/gi, '_')}.wav`);

    // Sync into Video Studio
    el.videoProjectName.textContent = sess.title;
    el.videoAudioPlayer.src = sess.audio_url;

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
    });
  });

  el.voiceSelect.addEventListener('change', updateVoiceDescription);

  el.speedSlider.addEventListener('input', (e) => {
    state.speed = parseFloat(e.target.value);
    el.speedVal.textContent = `${state.speed.toFixed(2)}x`;
    updateStats();
  });

  el.pauseParaSlider.addEventListener('input', (e) => {
    state.paragraphPause = parseFloat(e.target.value);
    el.pauseParaVal.textContent = `${state.paragraphPause.toFixed(1)}s`;
  });

  el.pauseSentSlider.addEventListener('input', (e) => {
    state.sentencePause = parseFloat(e.target.value);
    el.pauseSentVal.textContent = `${state.sentencePause.toFixed(2)}s`;
  });

  // Generate Narration Stream
  el.btnGenerate.addEventListener('click', async () => {
    const text = el.bookText.value.trim();
    if (!text) {
      alert('Please enter or paste book text to narrate.');
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
      alert(`Generation failed: ${err.message}`);
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
      alert(`Preview error: ${err.message}`);
    } finally {
      el.btnPreviewVoice.disabled = false;
      txt.textContent = orig;
    }
  });

  // Init
  initializeEngines();
  loadSessions();
  updateStats();
});
