/**
 * Text Editor actions: file upload, clear editor, and new project initialization.
 */

import { showToast } from '../ui/toast.js';
import { TranscriptionLayer, AudioWidgetLayer } from '../../video/scene.js';

export function setupTextEditor({ el, state, scene, callbacks }) {
  el.bookText.addEventListener('input', () => {
    callbacks.updateStats();
    callbacks.debouncedSaveDraft();
  });

  el.projectTitle.addEventListener('input', () => {
    callbacks.debouncedSaveDraft();
  });

  if (el.btnClearText) {
    el.btnClearText.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the text editor?')) {
        el.bookText.value = '';
        callbacks.updateStats();
        callbacks.debouncedSaveDraft();
      }
    });
  }

  el.fileUploader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!el.projectTitle.value.trim()) {
      el.projectTitle.value = file.name.replace(/\.[^/.]+$/, '');
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      el.bookText.value = event.target.result;
      callbacks.updateStats();
      callbacks.debouncedSaveDraft();
    };
    reader.readAsText(file);
  });

  el.btnNewProject.addEventListener('click', () => {
    state.activeSession = null;
    el.projectTitle.value = '';
    el.bookText.value = '';
    el.audioDeck.classList.add('hidden');
    el.progressCard.classList.add('hidden');
    callbacks.updateStats();
    callbacks.renderHistoryList();
    callbacks.setMode('narration');

    scene.layers = [
      new TranscriptionLayer({
        id: 'layer_captions',
        name: 'Synced Captions',
        x: 880, y: 240, width: 920, fontSize: 54, fill: '#111827', align: 'left', text: ''
      }),
      new AudioWidgetLayer({
        id: 'layer_player_widget',
        name: 'Audio Player Bar',
        x: 840, y: 720, width: 940, color: '#111827', thickness: 2.5, playheadRadius: 7
      })
    ];
    scene.syncedSegments = [];
    scene.duration = 10;
    el.videoAudioPlayer.src = '';
    el.videoProjectName.textContent = 'Untitled Project';

    callbacks.renderLayersList();
    callbacks.selectLayer('layer_captions');
    callbacks.buildTimelineRulerAndTracks();
    callbacks.renderVideoFrame(0);

    localStorage.removeItem('book_narrator_draft_buffer');
    fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', text: '', layers: null })
    }).catch(() => {});
    if (el.autosaveStatus) el.autosaveStatus.textContent = 'New Project';
    showToast('Created new project', 'info');
    el.bookText.focus();
  });
}
