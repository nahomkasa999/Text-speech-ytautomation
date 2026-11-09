function clock(seconds) {
  if (!Number.isFinite(seconds)) return 'Measuring…';
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export class ExportProgress {
  constructor(onCancel) {
    this.element = document.createElement('div');
    this.element.className = 'export-modal-backdrop';
    this.element.innerHTML = `<section class="export-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="export-progress-title">
      <div class="export-modal-header"><h3 id="export-progress-title">Exporting video</h3></div>
      <div class="export-modal-body">
        <p data-stage role="status" aria-live="polite">Choose output location</p>
        <progress max="1" value="0" style="width:100%" aria-label="Export progress"></progress>
        <p data-timing></p><p data-speed></p><p data-eta></p>
        <p>Your video is saved to the location you chose when the export completes.</p>
      </div>
      <div class="export-modal-footer"><button class="btn btn-secondary" data-cancel>Cancel export</button></div>
    </section>`;
    document.body.append(this.element);
    this.element.querySelector('[data-cancel]').addEventListener('click', () => {
      onCancel();
      this.element.querySelector('[data-cancel]').disabled = true;
      this.element.querySelector('[data-stage]').textContent = 'Cancelling and removing unfinished files…';
      this.cancelling = true;
    });
    this.element.querySelector('[data-cancel]').focus();
  }

  update(status) {
    if (this.cancelling) return;
    this.element.querySelector('[data-stage]').textContent = `${status.stage || 'Preparing'}${Number.isFinite(status.progress) ? ` · ${Math.round(status.progress * 100)}%` : ''}`;
    const progress = this.element.querySelector('progress');
    if (Number.isFinite(status.progress)) progress.value = status.progress;
    else progress.removeAttribute('value');
    this.element.querySelector('[data-timing]').textContent = `Elapsed ${clock(status.elapsed_seconds)} · Encoded ${clock(status.encoded_seconds || 0)}`;
    this.element.querySelector('[data-speed]').textContent = Number.isFinite(status.speed) && status.speed > 0
      ? `Encoding speed ${status.speed.toFixed(2)}× real time` : 'Encoding speed · measuring…';
    this.element.querySelector('[data-eta]').textContent = `Estimated time remaining ${clock(status.eta_seconds)}`;
  }

  close() { this.element.remove(); }
}
