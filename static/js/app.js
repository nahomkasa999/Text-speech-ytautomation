/**
 * AI Book Narrator & YouTube Automation Video Studio
 * Handles Voice Synthesis (Local Kokoro, RunPod, Cloud) +
 * YouTube Automation Video Studio (Image + Synced Captions + Audio Widget + MP4 Export).
 */

document.addEventListener('DOMContentLoaded', () => {
  // App Mode: 'narration' | 'video'
  let currentMode = 'narration';

  // Application State
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
    
    // Video Studio Config
    video: {
      bgImage: null,
      bgImageLoaded: false,
      caption: {
        x: 0.47, // 47% from left (right side of book)
        y: 0.22, // 22% from top
        width: 0.48, // 48% width of canvas
        font: "'Merriweather', serif",
        size: 54,
        color: '#111827',
        weight: '700',
        casing: 'lower', // 'lower' | 'normal' | 'upper'
        align: 'left'
      },
      playerWidget: {
        enabled: true,
        y: 0.68,
        color: '#111827'
      },
      syncedSegments: [],
      isPlaying: false,
      isExporting: false
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

    // Narration Elements
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

    // Video Studio Elements
    videoCanvas: document.getElementById('video-canvas'),
    canvasContainer: document.getElementById('canvas-container'),
    captionBox: document.getElementById('caption-box'),
    captionPreviewText: document.getElementById('caption-preview-text'),
    bgImageUploader: document.getElementById('bg-image-uploader'),
    btnSampleTemplate: document.getElementById('btn-sample-template'),
    videoAudioPlayer: document.getElementById('video-audio-player'),
    btnVideoPlay: document.getElementById('btn-video-play'),
    videoPlaySvg: document.getElementById('video-play-svg'),
    videoScrubber: document.getElementById('video-scrubber'),
    videoTimecode: document.getElementById('video-timecode'),
    btnExportMp4: document.getElementById('btn-export-mp4'),
    exportBtnLabel: document.getElementById('export-btn-label'),
    videoProjectName: document.getElementById('video-project-name'),

    // Video Settings Elements
    captionFontSelect: document.getElementById('caption-font-select'),
    captionSizeSlider: document.getElementById('caption-size-slider'),
    captionSizeVal: document.getElementById('caption-size-val'),
    captionColorPicker: document.getElementById('caption-color-picker'),
    colorPresetBtns: document.querySelectorAll('.color-preset-btn'),
    casingBtns: document.querySelectorAll('[data-casing]'),
    weightBtns: document.querySelectorAll('[data-weight]'),
    togglePlayerWidget: document.getElementById('toggle-player-widget'),
    playerWidgetControls: document.getElementById('player-widget-controls'),
    widgetYSlider: document.getElementById('widget-y-slider'),
    widgetYVal: document.getElementById('widget-y-val'),
  };

  const canvasCtx = el.videoCanvas.getContext('2d');

  // Switch Between Narrator & Video Studio Modes
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
      
      // If we don't have an active session loaded into video, load the latest
      if (!state.activeSession && state.sessions.length > 0) {
        selectSession(state.sessions[0]);
      }
      initVideoStudio();
    }
  };

  el.tabModeNarration.addEventListener('click', () => setMode('narration'));
  el.tabModeVideo.addEventListener('click', () => setMode('video'));
  el.btnOpenInVideoStudio.addEventListener('click', () => setMode('video'));

  // Calculate stats & durations
  const updateStats = () => {
    const text = el.bookText.value.trim();
    const chars = text.length;
    const words = text ? text.split(/\s+/).length : 0;
    const wordsPerMinute = 150 * state.speed;
    const totalMinutes = words > 0 ? Math.ceil(words / wordsPerMinute) : 0;
    
    el.statWords.textContent = words.toLocaleString();
    el.statChars.textContent = chars.toLocaleString();
    
    if (totalMinutes < 60) {
      el.statTime.textContent = `~${totalMinutes}m`;
    } else {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      el.statTime.textContent = `~${hrs}h ${mins}m`;
    }
  };

  const formatDuration = (seconds) => {
    const s = Math.round(seconds || 0);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render voice selector options
  const renderVoices = () => {
    const list = state.voices[state.engine] || [];
    el.voiceSelect.innerHTML = '';
    if (list.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Loading voices...';
      el.voiceSelect.appendChild(opt);
      return;
    }
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

  // Initialize Engines & Status
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
    } catch (e) {
      console.warn('Init fetch failed:', e);
    }
  };

  // Sessions Management
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
      el.historyList.innerHTML = `
        <div class="history-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
          <p>No past narrations yet.</p>
          <small>Generate an audiobook to save it here.</small>
        </div>
      `;
      return;
    }

    el.historyList.innerHTML = '';
    state.sessions.forEach(sess => {
      const item = document.createElement('div');
      item.className = `history-item ${(state.activeSession && sess.id === state.activeSession.id) ? 'active' : ''}`;
      item.innerHTML = `
        <div class="history-item-top">
          <span class="history-item-title" title="${sess.title}">${sess.title}</span>
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
          if (state.activeSession && state.activeSession.id === sess.id) {
            state.activeSession = null;
          }
          loadSessions();
        }
      });

      el.historyList.appendChild(item);
    });
  };

  const selectSession = (sess) => {
    state.activeSession = sess;
    el.projectTitle.value = sess.title;
    el.bookText.value = sess.text;
    updateStats();

    // Show audio deck in Narrator view
    el.audioDeck.classList.remove('hidden');
    el.deckTitle.textContent = sess.title;
    el.deckSubtitle.textContent = `${sess.word_count.toLocaleString()} words • ${formatDuration(sess.duration_seconds)} • ${sess.engine.toUpperCase()}`;
    el.mainAudioPlayer.src = sess.audio_url;
    el.btnDownloadAudio.href = sess.audio_url;
    el.btnDownloadAudio.setAttribute('download', `${sess.title.replace(/[^a-z0-9_-]/gi, '_')}.wav`);

    // Sync into Video Studio
    el.videoProjectName.textContent = sess.title;
    el.videoAudioPlayer.src = sess.audio_url;
    buildSyncedSegments(sess.text, sess.duration_seconds);

    renderHistoryList();
    if (currentMode === 'video') {
      renderVideoFrame(0);
    }
  };

  // Build timestamps for captions across audio duration
  const buildSyncedSegments = (text, totalDuration) => {
    // Split text into speakable sentences
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
      const fraction = s.length / Math.max(1, totalChars);
      const segDuration = fraction * totalDuration;
      const seg = {
        start: currentStart,
        end: currentStart + segDuration,
        text: s
      };
      currentStart += segDuration;
      return seg;
    });
  };

  // =========================================================
  // VIDEO STUDIO: RENDERING & CANVAS ENGINE
  // =========================================================

  const initVideoStudio = () => {
    if (!state.video.bgImage) {
      loadBackgroundTemplate('/templates/sample-book.jpg');
    } else {
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    }
    updateCaptionBoxPosition();
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

  // Load custom user image
  el.bgImageUploader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      loadBackgroundTemplate(event.target.result);
    };
    reader.readAsDataURL(file);
  });

  el.btnSampleTemplate.addEventListener('click', () => {
    loadBackgroundTemplate('/templates/sample-book.jpg');
  });

  // Get active caption at current timecode
  const getActiveCaptionText = (time) => {
    if (state.video.syncedSegments.length === 0) {
      return (el.bookText.value.trim() || 'let me say that again your emotions are not your friend').slice(0, 120);
    }
    const current = state.video.syncedSegments.find(s => time >= s.start && time <= s.end);
    if (current) return current.text;
    return state.video.syncedSegments[0]?.text || '';
  };

  // Format text according to casing setting
  const formatCaptionCasing = (str) => {
    if (state.video.caption.casing === 'lower') return str.toLowerCase();
    if (state.video.caption.casing === 'upper') return str.toUpperCase();
    return str;
  };

  // Render a single video frame onto the 1920x1080 canvas
  const renderVideoFrame = (currentTime) => {
    const width = 1920;
    const height = 1080;
    canvasCtx.clearRect(0, 0, width, height);

    // 1. Draw Background Image
    if (state.video.bgImageLoaded && state.video.bgImage) {
      canvasCtx.drawImage(state.video.bgImage, 0, 0, width, height);
    } else {
      // Warm Terracotta Fallback (like reference image)
      canvasCtx.fillStyle = '#C85A32';
      canvasCtx.fillRect(0, 0, width, height);
    }

    const duration = el.videoAudioPlayer.duration || 1;
    const progress = Math.min(1, Math.max(0, currentTime / duration));

    // 2. Draw Aesthetic Audio Player Widget
    if (state.video.playerWidget.enabled) {
      drawAestheticAudioWidget(canvasCtx, progress, width, height);
    }

    // 3. Draw Synchronized Captions
    const activeText = formatCaptionCasing(getActiveCaptionText(currentTime));
    drawCaptionText(canvasCtx, activeText, width, height);
  };

  // Draw Aesthetic Audio Bar (Line, dot, play/pause and skip triangles)
  const drawAestheticAudioWidget = (ctx, progress, canvasW, canvasH) => {
    const startX = canvasW * 0.44;
    const endX = canvasW * 0.93;
    const barY = canvasH * state.video.playerWidget.y;
    const barWidth = endX - startX;
    const currentX = startX + (barWidth * progress);

    ctx.save();
    ctx.strokeStyle = state.video.playerWidget.color;
    ctx.fillStyle = state.video.playerWidget.color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    // Main horizontal track
    ctx.beginPath();
    ctx.moveTo(startX, barY);
    ctx.lineTo(endX, barY);
    ctx.stroke();

    // Progress dot / scrub handle
    ctx.beginPath();
    ctx.arc(currentX, barY, 18, 0, Math.PI * 2);
    ctx.fill();

    // Transport Icons below the line: [ << ]  [ || / > ]  [ >> ]
    const iconCenterY = barY + 75;
    const centerX = startX + (barWidth / 2);

    // Previous Triangle Icon (<<)
    const prevX = centerX - 120;
    ctx.beginPath();
    ctx.moveTo(prevX + 15, iconCenterY - 20);
    ctx.lineTo(prevX - 15, iconCenterY);
    ctx.lineTo(prevX + 15, iconCenterY + 20);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(prevX - 5, iconCenterY - 20);
    ctx.lineTo(prevX - 35, iconCenterY);
    ctx.lineTo(prevX - 5, iconCenterY + 20);
    ctx.closePath();
    ctx.fill();

    // Play / Pause Icon in Center
    if (state.video.isPlaying) {
      // Pause Bars ( || )
      ctx.fillRect(centerX - 16, iconCenterY - 24, 10, 48);
      ctx.fillRect(centerX + 6, iconCenterY - 24, 10, 48);
    } else {
      // Play Triangle ( > )
      ctx.beginPath();
      ctx.moveTo(centerX - 15, iconCenterY - 24);
      ctx.lineTo(centerX + 22, iconCenterY);
      ctx.lineTo(centerX - 15, iconCenterY + 24);
      ctx.closePath();
      ctx.fill();
    }

    // Next Triangle Icon (>>)
    const nextX = centerX + 120;
    ctx.beginPath();
    ctx.moveTo(nextX - 15, iconCenterY - 20);
    ctx.lineTo(nextX + 15, iconCenterY);
    ctx.lineTo(nextX - 15, iconCenterY + 20);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(nextX + 5, iconCenterY - 20);
    ctx.lineTo(nextX + 35, iconCenterY);
    ctx.lineTo(nextX + 5, iconCenterY + 20);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  // Draw Multi-line Wrapped Caption Text with selected typography
  const drawCaptionText = (ctx, text, canvasW, canvasH) => {
    if (!text) return;

    ctx.save();
    const cfg = state.video.caption;
    ctx.font = `${cfg.weight} ${cfg.size}px ${cfg.font}`;
    ctx.fillStyle = cfg.color;
    ctx.textBaseline = 'top';

    const maxLineWidth = canvasW * cfg.width;
    const startX = canvasW * cfg.x;
    const startY = canvasH * cfg.y;
    const lineHeight = cfg.size * 1.35;

    // Word wrap
    const words = text.split(' ');
    let line = '';
    let currentY = startY;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxLineWidth && n > 0) {
        ctx.fillText(line.trim(), startX, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), startX, currentY);
    ctx.restore();
  };

  // Sync On-Canvas Draggable Overlay Box
  const updateCaptionBoxPosition = () => {
    const cfg = state.video.caption;
    el.captionBox.style.left = `${cfg.x * 100}%`;
    el.captionBox.style.top = `${cfg.y * 100}%`;
    el.captionBox.style.width = `${cfg.width * 100}%`;
    el.captionPreviewText.style.fontFamily = cfg.font;
    el.captionPreviewText.style.fontWeight = cfg.weight;
    el.captionPreviewText.style.color = cfg.color;
    el.captionPreviewText.textContent = formatCaptionCasing(getActiveCaptionText(el.videoAudioPlayer.currentTime || 0));
  };

  // Dragging the Caption Box on Canvas
  let isDragging = false;
  let dragStartX, dragStartY, initialCaptionX, initialCaptionY;

  el.captionBox.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialCaptionX = state.video.caption.x;
    initialCaptionY = state.video.caption.y;
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  });

  const onDragMove = (e) => {
    if (!isDragging) return;
    const containerRect = el.canvasContainer.getBoundingClientRect();
    const deltaX = (e.clientX - dragStartX) / containerRect.width;
    const deltaY = (e.clientY - dragStartY) / containerRect.height;

    state.video.caption.x = Math.max(0.05, Math.min(0.85, initialCaptionX + deltaX));
    state.video.caption.y = Math.max(0.05, Math.min(0.85, initialCaptionY + deltaY));
    
    updateCaptionBoxPosition();
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  };

  const onDragEnd = () => {
    isDragging = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  };

  // Video Transport / Playback Controls
  const toggleVideoPlay = () => {
    if (!el.videoAudioPlayer.src) {
      alert('Please select or generate an audiobook narration first.');
      return;
    }

    if (state.video.isPlaying) {
      el.videoAudioPlayer.pause();
      state.video.isPlaying = false;
      el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    } else {
      el.videoAudioPlayer.play();
      state.video.isPlaying = true;
      el.videoPlaySvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      requestAnimationFrame(videoAnimationLoop);
    }
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  };

  el.btnVideoPlay.addEventListener('click', toggleVideoPlay);

  const videoAnimationLoop = () => {
    if (!state.video.isPlaying && !state.video.isExporting) return;
    const cur = el.videoAudioPlayer.currentTime;
    const dur = el.videoAudioPlayer.duration || 1;

    renderVideoFrame(cur);
    updateCaptionBoxPosition();

    // Update scrubber & timecode
    el.videoScrubber.value = (cur / dur) * 100;
    el.videoTimecode.textContent = `${formatDuration(cur)} / ${formatDuration(dur)}`;

    if (cur >= dur) {
      state.video.isPlaying = false;
      el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      return;
    }

    requestAnimationFrame(videoAnimationLoop);
  };

  el.videoAudioPlayer.addEventListener('ended', () => {
    state.video.isPlaying = false;
    el.videoPlaySvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    renderVideoFrame(0);
  });

  el.videoScrubber.addEventListener('input', (e) => {
    const dur = el.videoAudioPlayer.duration || 1;
    const targetTime = (parseFloat(e.target.value) / 100) * dur;
    el.videoAudioPlayer.currentTime = targetTime;
    el.videoTimecode.textContent = `${formatDuration(targetTime)} / ${formatDuration(dur)}`;
    renderVideoFrame(targetTime);
    updateCaptionBoxPosition();
  });

  // Typography Controls
  el.captionFontSelect.addEventListener('change', (e) => {
    state.video.caption.font = e.target.value;
    updateCaptionBoxPosition();
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  });

  el.captionSizeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.video.caption.size = val;
    el.captionSizeVal.textContent = `${val}px`;
    updateCaptionBoxPosition();
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  });

  el.captionColorPicker.addEventListener('input', (e) => {
    state.video.caption.color = e.target.value;
    state.video.playerWidget.color = e.target.value;
    updateCaptionBoxPosition();
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  });

  el.colorPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.color;
      state.video.caption.color = col;
      state.video.playerWidget.color = col;
      el.captionColorPicker.value = col;
      updateCaptionBoxPosition();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    });
  });

  el.casingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.casingBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.video.caption.casing = btn.dataset.casing;
      updateCaptionBoxPosition();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    });
  });

  el.weightBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.weightBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.video.caption.weight = btn.dataset.weight;
      updateCaptionBoxPosition();
      renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
    });
  });

  el.togglePlayerWidget.addEventListener('change', (e) => {
    state.video.playerWidget.enabled = e.target.checked;
    el.playerWidgetControls.classList.toggle('hidden', !e.target.checked);
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  });

  el.widgetYSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value) / 100;
    state.video.playerWidget.y = val;
    el.widgetYVal.textContent = `${e.target.value}%`;
    renderVideoFrame(el.videoAudioPlayer.currentTime || 0);
  });

  // =========================================================
  // MP4 VIDEO EXPORT (Hardware Accelerated Canvas Recording)
  // =========================================================
  const exportMp4Video = async () => {
    if (!el.videoAudioPlayer.src) {
      alert('Please generate or load an audio track first.');
      return;
    }

    state.video.isExporting = true;
    el.btnExportMp4.disabled = true;
    el.exportBtnLabel.textContent = 'Recording Video...';

    // Rewind audio to beginning
    el.videoAudioPlayer.currentTime = 0;
    el.captionBox.style.display = 'none'; // hide drag borders during export

    try {
      const stream = el.videoCanvas.captureStream(30); // 30 fps
      
      // Hook audio stream via AudioContext
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(el.videoAudioPlayer);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination); // keep audible for user

      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') 
        ? 'video/mp4;codecs=avc1' 
        : (MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm');

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5000000 });
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
        const filename = (state.activeSession?.title || 'youtube_book_video').replace(/[^a-z0-9_-]/gi, '_');
        a.download = `${filename}.${ext}`;
        a.click();

        el.captionBox.style.display = 'block';
        el.btnExportMp4.disabled = false;
        el.exportBtnLabel.textContent = 'Export MP4 Video';
        state.video.isExporting = false;
        alert(`Video successfully exported as ${filename}.${ext}!`);
      };

      recorder.start();
      await el.videoAudioPlayer.play();
      state.video.isPlaying = true;
      requestAnimationFrame(videoAnimationLoop);

      el.videoAudioPlayer.onended = () => {
        recorder.stop();
        audioCtx.close();
      };
    } catch (err) {
      alert(`Export error: ${err.message}`);
      el.captionBox.style.display = 'block';
      el.btnExportMp4.disabled = false;
      el.exportBtnLabel.textContent = 'Export MP4 Video';
      state.video.isExporting = false;
    }
  };

  el.btnExportMp4.addEventListener('click', exportMp4Video);

  // =========================================================
  // NARRATION TAB CONTROLS (KOKORO / RUNPOD / CLOUD)
  // =========================================================
  el.bookText.addEventListener('input', updateStats);
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
      } else {
        alert(`Preview failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Preview error: ${err.message}`);
    } finally {
      el.btnPreviewVoice.disabled = false;
      txt.textContent = orig;
    }
  });

  // Generate Full Narration via SSE
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
    el.progressSnippetText.textContent = 'Filtering Markdown (#, *) and preparing narrative chunks...';

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

  el.btnClearText.addEventListener('click', () => {
    if (confirm('Clear the current text?')) {
      el.bookText.value = '';
      updateStats();
    }
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

  // Initialize
  initializeEngines();
  loadSessions();
  updateStats();
});
