/**
 * Narration Generation and SSE Live Progress Streamer.
 */

import { showToast } from '../ui/toast.js';

export class NarrationGenerator {
  constructor({ el, state, callbacks }) {
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  attachEvents() {
    this.el.btnGenerate.addEventListener('click', () => this.generate());
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
        : (this.el.cloudApiKey ? this.el.cloudApiKey.value.trim() : ''),
      instruction: this.el.deployedInstruction ? this.el.deployedInstruction.value.trim() : '',
      cloud_provider: this.el.cloudProvider ? this.el.cloudProvider.value : 'openai'
    };
  }

  _setGeneratingState(isGen) {
    this.state.isGenerating = isGen;
    this.el.btnGenerate.disabled = isGen;
    this.el.btnGenerateLabel.textContent = isGen ? 'Generating Audio...' : 'Generate Narration';
    if (isGen) {
      this.el.progressCard.classList.remove('hidden');
      this.el.audioDeck.classList.add('hidden');
      this.el.progressBarFill.style.width = '0%';
      this.el.progressChunkInfo.textContent = 'Starting...';
      this.el.progressEta.textContent = 'ETA: Calculating...';
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
        if (data.status === 'progress') {
          this.el.progressBarFill.style.width = `${data.percent}%`;
          this.el.progressChunkInfo.textContent = `Chunk ${data.current_chunk} / ${data.total_chunks} (${data.percent}%)`;
          this.el.progressEta.textContent = `ETA: ${data.eta_seconds}s`;
          this.el.progressSnippetText.textContent = data.current_text;
        } else if (data.status === 'stitching') {
          this.el.progressBarFill.style.width = `98%`;
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
          throw new Error(data.error);
        }
      }
    }
  }
}
