/**
 * Narration Generation and SSE Live Progress Streamer.
 */

import { showToast } from '../ui/toast.js';
import { formatClock } from '../ui/timeFormat.js';

export class NarrationGenerator {
  constructor({ el, state, callbacks }) {
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  attachEvents() {
    this.el.btnGenerate.addEventListener('click', () => this.generate());
    this.el.btnPauseGeneration.addEventListener('click', () => this._togglePause());
    this.el.btnCancelGeneration.addEventListener('click', () => this._cancel());
    this.spokenWords = [];
    new ResizeObserver(() => this._fitSnippet()).observe(this.el.progressSnippetText);
  }

  _showSpoken(text) {
    this.spokenWords = this.spokenWords.concat(text.split(/\s+/).filter(Boolean)).slice(-400);
    this._fitSnippet();
  }

  /** Show as many of the newest words as the box can hold, cut at a word boundary. */
  _fitSnippet() {
    const box = this.el.progressSnippetText;
    const words = this.spokenWords;
    if (!words.length || !box.clientHeight) return;
    const fits = (n) => {
      box.textContent = (n < words.length ? '… ' : '') + words.slice(-n).join(' ');
      return box.scrollHeight <= box.clientHeight + 1;
    };
    let low = 1, high = words.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(mid)) low = mid; else high = mid - 1;
    }
    fits(low);
  }

  async _control(action) {
    if (!this.jobId) return;
    const response = await fetch(`/api/generate/${this.jobId}/${action}`, { method: 'POST' });
    if (!response.ok) showToast('This generation has already finished.', 'error');
  }

  _togglePause() {
    const pausing = !this.pauseRequested;
    this.pauseRequested = pausing;
    this.el.btnPauseGeneration.textContent = pausing ? 'Resume' : 'Pause';
    this.el.progressStatusTitle.textContent = pausing ? 'Pausing after this sentence...' : 'Generating Narration...';
    this._control(pausing ? 'pause' : 'resume');
  }

  _cancel() {
    this.el.btnPauseGeneration.disabled = true;
    this.el.btnCancelGeneration.disabled = true;
    this.el.progressStatusTitle.textContent = 'Cancelling after this sentence...';
    this._control('cancel');
  }

  async generate() {
    const text = this.el.bookText.value.trim();
    if (!text) {
      showToast('Please enter or paste book text to narrate.', 'error');
      return;
    }

    this._setGeneratingState(true);
    const payload = this._buildPayload(text);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await response.text());

      await this._readSseStream(response.body.getReader());
    } catch (err) {
      showToast(`Generation failed: ${err.message}`, 'error');
      this.el.progressCard.classList.add('hidden');
    } finally {
      this._setGeneratingState(false);
    }
  }

  _buildPayload(text) {
    return {
      title: this.el.projectTitle.value.trim(),
      text,
      engine: this.state.engine,
      voice: this.el.voiceSelect.value,
      speed: this.state.speed,
      paragraph_pause: this.state.paragraphPause,
      sentence_pause: this.state.sentencePause,
      endpoint_url: this.el.deployedEndpoint ? this.el.deployedEndpoint.value.trim() : '',
      api_key: this.state.engine === 'deployed'
        ? (this.el.deployedToken ? this.el.deployedToken.value.trim() : '')
        : (this.state.engine === 'voice_design'
            ? (this.el.geminiApiKey?.value.trim() || localStorage.getItem('book_narrator_gemini_api_key') || '')
            : (this.el.cloudApiKey ? this.el.cloudApiKey.value.trim() : '')),
      instruction: this.el.deployedInstruction ? this.el.deployedInstruction.value.trim() : '',
      cloud_provider: this.el.cloudProvider ? this.el.cloudProvider.value : 'openai'
    };
  }

  _setGeneratingState(isGen) {
    this.state.isGenerating = isGen;
    this.jobId = null;
    this.pauseRequested = false;
    this.el.btnPauseGeneration.textContent = 'Pause';
    this.el.btnPauseGeneration.disabled = !isGen;
    this.el.btnCancelGeneration.disabled = !isGen;
    this.el.btnGenerate.disabled = isGen;
    this.el.btnGenerateLabel.textContent = isGen ? 'Generating Audio...' : 'Generate Narration';
    if (isGen) {
      this.el.progressCard.classList.remove('hidden');
      this.el.audioDeck.classList.add('hidden');
      this.el.progressBarFill.style.width = '0%';
      this.el.progressChunkInfo.textContent = 'Starting...';
      this.el.progressEta.textContent = 'ETA: Calculating...';
      this.el.progressStatusTitle.textContent = 'Generating Narration...';
      this.spokenWords = [];
      this.el.progressSnippetText.textContent = 'Filtering Markdown and chunking sentences...';
    }
  }

  async _readSseStream(reader) {
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
        if (data.status === 'started') {
          this.jobId = data.job_id;
          await this.callbacks.loadSessions();
        } else if (data.status === 'paused') {
          this.el.progressStatusTitle.textContent = 'Paused';
        } else if (data.status === 'resumed') {
          this.el.progressStatusTitle.textContent = 'Generating Narration...';
        } else if (data.status === 'cancelled') {
          this.el.progressCard.classList.add('hidden');
          await this.callbacks.loadSessions();
          showToast('Generation cancelled.', 'info');
          return;
        } else if (data.status === 'progress') {
          this.el.progressBarFill.style.width = `${data.percent}%`;
          this.el.progressChunkInfo.textContent = `Chunk ${data.current_chunk} / ${data.total_chunks} (${data.percent}%)`;
          this.el.progressEta.textContent = `ETA: ${formatClock(data.eta_seconds)}`;
          this._showSpoken(data.current_text);
        } else if (data.status === 'stitching') {
          this.el.progressBarFill.style.width = `98%`;
          this.el.btnPauseGeneration.disabled = true;
          this.el.btnCancelGeneration.disabled = true;
          this.el.progressStatusTitle.textContent = 'Finalizing Audio...';
          this.el.progressSnippetText.textContent = data.message;
        } else if (data.status === 'completed') {
          this.el.progressBarFill.style.width = `100%`;
          this.el.progressCard.classList.add('hidden');
          await this.callbacks.loadSessions();
          this.callbacks.selectSession(data.session);
          this.callbacks.saveBgForActiveSession?.(this.callbacks.getPersistableBgUrl?.());
          this.el.mainAudioPlayer.play().catch(() => {});
        } else if (data.status === 'error') {
          await this.callbacks.loadSessions();
          throw new Error(data.error);
        }
      }
    }
  }
}
