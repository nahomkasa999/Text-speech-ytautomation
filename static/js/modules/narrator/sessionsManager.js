/**
 * Session History and Project Chapter Manager.
 */

import { fetchSessionsApi, deleteSessionApi } from '../services/api.js';
import { formatDuration } from '../ui/timeFormat.js';
import { showToast } from '../ui/toast.js';
import { TranscriptionLayer, AudioWidgetLayer, createLayerFromData } from '../../video/scene.js';

export class SessionsManager {
  constructor({ el, state, scene, callbacks }) {
    this.el = el;
    this.state = state;
    this.scene = scene;
    this.callbacks = callbacks;
  }

  async loadSessions() {
    try {
      this.state.sessions = await fetchSessionsApi();
      this.renderHistoryList();
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }

  renderHistoryList() {
    this.el.sessionCountBadge.textContent = this.state.sessions.length;
    if (this.state.sessions.length === 0) {
      this.el.historyList.innerHTML = `<div class="history-empty"><p>No past narrations yet.</p></div>`;
      return;
    }

    this.el.historyList.innerHTML = '';
    this.state.sessions.forEach(sess => {
      const item = document.createElement('div');
      item.className = `history-item ${(this.state.activeSession && sess.id === this.state.activeSession.id) ? 'active' : ''}`;
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
        this.selectSession(sess);
      });

      const delBtn = item.querySelector('.btn-delete-session');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${sess.title}"?`)) {
          await deleteSessionApi(sess.id);
          if (this.state.activeSession && this.state.activeSession.id === sess.id) {
            this.el.btnNewProject.click();
          }
          await this.loadSessions();
          showToast(`Deleted "${sess.title}"`, 'info');
        }
      });

      this.el.historyList.appendChild(item);
    });
  }

  selectSession(sess) {
    this.state.activeSession = sess;
    this.el.projectTitle.value = sess.title;
    this.el.bookText.value = sess.text;
    this.callbacks.updateStats();

    this.el.audioDeck.classList.remove('hidden');
    this.el.deckTitle.textContent = sess.title;
    this.el.deckSubtitle.textContent = `${sess.word_count.toLocaleString()} words • ${formatDuration(sess.duration_seconds)}`;
    
    this.el.mainAudioPlayer.src = sess.audio_url;
    this.el.mainAudioPlayer.load();
    this.el.videoAudioPlayer.src = sess.audio_url;
    this.el.videoAudioPlayer.currentTime = 0;
    this.el.btnDownloadAudio.href = sess.audio_url;
    this.el.btnDownloadAudio.setAttribute('download', `${sess.title.replace(/[^a-z0-9_-]/gi, '_')}.wav`);
    this.el.videoProjectName.textContent = sess.title;

    if (sess.bg_image && sess.bg_image !== this.state.video.bgImageUrl) {
      this.callbacks.loadBackgroundTemplate(sess.bg_image, false);
    }

    this._setupSessionLayers(sess);
    this._setupSessionSegments(sess);

    this.renderHistoryList();
    this.callbacks.renderLayersList();
    this.callbacks.selectLayer('layer_captions');
    this.callbacks.buildTimelineRulerAndTracks();
    this.callbacks.renderVideoFrame(0);
    this.callbacks.updatePlayheadPosition(0, sess.duration_seconds || 10);
  }

  _setupSessionLayers(sess) {
    const capLayer = new TranscriptionLayer({
      id: 'layer_captions',
      name: 'Synced Captions',
      x: 880, y: 240, width: 920, fontSize: 54, fill: '#111827', align: 'left',
      text: sess.text ? sess.text.slice(0, 140) : ''
    });
    const playerWidget = new AudioWidgetLayer({
      id: 'layer_player_widget',
      name: 'Audio Player Bar',
      x: 840, y: 720, width: 940, color: '#111827', thickness: 2.5, playheadRadius: 7
    });

    if (sess.videoLayers && Array.isArray(sess.videoLayers) && sess.videoLayers.length > 0) {
      this.scene.layers = sess.videoLayers.map(createLayerFromData).filter(Boolean);
      if (!this.scene.getLayer('layer_captions')) this.scene.addLayer(capLayer);
      if (!this.scene.getLayer('layer_player_widget')) this.scene.addLayer(playerWidget);
      this.scene.layers.forEach(l => {
        if (l.endTime === 10 || typeof l.endTime !== 'number') l.endTime = 999999;
      });
    } else {
      this.scene.layers = [capLayer, playerWidget];
    }
  }

  _setupSessionSegments(sess) {
    if (Array.isArray(sess.synced_segments) && sess.synced_segments.length > 0) {
      this.state.video.syncedSegments = sess.synced_segments;
      this.scene.syncedSegments = sess.synced_segments;
      this.scene.duration = sess.duration_seconds || 10;
    } else {
      this.buildSyncedSegments(sess.text, sess.duration_seconds, sess.paragraph_pause, sess.sentence_pause);
    }
  }

  buildSyncedSegments(text, totalDuration, paragraphPause, sentencePause) {
    const pPause = typeof paragraphPause === 'number' ? paragraphPause : (this.state.paragraphPause || 0.6);
    const sPause = typeof sentencePause === 'number' ? sentencePause : (this.state.sentencePause || 0.25);
    const clean = text.replace(/^[ \t]*#{1,6}\s+/gm, '').replace(/[*_`]/g, '').trim();

    if (!clean || !totalDuration) {
      this.state.video.syncedSegments = [{ start: 0, end: totalDuration || 10, text: clean || text }];
      this.scene.syncedSegments = this.state.video.syncedSegments;
      this.scene.duration = totalDuration || 10;
      return;
    }

    const sentenceList = [];
    clean.split(/\n\s*\n+/).filter(Boolean).forEach((para, pIdx, arr) => {
      const isLastPara = pIdx === arr.length - 1;
      const sents = (para.match(/[^.!?\n]+[.!?\n]*/g) || [para]).map(s => s.trim().replace(/\n+/g, ' ')).filter(Boolean);
      sents.forEach((sent, sIdx) => {
        const isParaEnd = sIdx === sents.length - 1;
        const pause = (isLastPara && isParaEnd) ? 0 : (isParaEnd ? pPause : sPause);
        sentenceList.push({ text: sent, charCount: Math.max(1, sent.length), pauseDuration: pause, isParagraphEnd: isParaEnd });
      });
    });

    const totalChars = sentenceList.reduce((acc, s) => acc + s.charCount, 0);
    const totalPauses = sentenceList.reduce((acc, s) => acc + s.pauseDuration, 0);
    const netSpeechDuration = Math.max(0.1, totalDuration - totalPauses);
    const speechRate = netSpeechDuration / Math.max(1, totalChars);

    let curStart = 0;
    this.state.video.syncedSegments = sentenceList.map(s => {
      const speechDur = s.charCount * speechRate;
      const segStart = curStart;
      const segEnd = segStart + speechDur + s.pauseDuration;
      curStart = segEnd;
      return {
        start: Math.round(segStart * 100) / 100,
        end: Math.round(segEnd * 100) / 100,
        speech_end: Math.round((segStart + speechDur) * 100) / 100,
        text: s.text,
        is_paragraph_end: s.isParagraphEnd
      };
    });

    this.scene.syncedSegments = this.state.video.syncedSegments;
    this.scene.duration = totalDuration;
  }
}
