/**
 * Export Options Modal: Select resolution (16:9, 9:16 Shorts, 720p, 1:1) and format (MP4/WebM).
 */

export class ExportOptionsModal {
  constructor({ onConfirm }) {
    this.onConfirm = onConfirm;
    this.modalEl = null;
    this.createModal();
  }

  createModal() {
    let existing = document.getElementById('export-options-modal');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'export-options-modal';
    div.className = 'export-modal-backdrop hidden';
    div.innerHTML = `
      <div class="export-modal-dialog">
        <div class="export-modal-header">
          <h3>Export Video Options</h3>
          <button class="export-modal-close" id="export-modal-close-btn">&times;</button>
        </div>
        <div class="export-modal-body">
          <div class="export-field-group">
            <label class="export-label">Aspect Ratio & Resolution</label>
            <select id="export-select-resolution" class="export-select">
              <option value="1920x1080" selected>1080p Full HD (1920×1080) — 16:9 Landscape (YouTube)</option>
              <option value="1080x1920">1080×1920 — 9:16 Vertical (TikTok / Shorts / Reels)</option>
              <option value="1280x720">720p HD (1280×720) — 16:9 Landscape</option>
              <option value="1080x1080">1080×1080 — 1:1 Square (Instagram)</option>
            </select>
          </div>

          <div class="export-field-group">
            <label class="export-label">Format</label>
            <div class="export-radio-group">
              <label><input type="radio" name="export-format" value="mp4" checked /> MP4 (H.264 / AAC)</label>
              <label><input type="radio" name="export-format" value="webm" /> WebM (VP9 / Opus)</label>
            </div>
          </div>

          <div class="export-field-group">
            <label class="export-checkbox-label">
              <input type="checkbox" id="export-include-bgm" checked />
              Include Background Music
            </label>
          </div>
        </div>

        <div class="export-modal-footer">
          <button id="export-modal-cancel" class="btn btn-secondary btn-sm">Cancel</button>
          <button id="export-modal-start" class="btn btn-success btn-sm">Start Export</button>
        </div>
      </div>
    `;

    document.body.appendChild(div);
    this.modalEl = div;

    document.getElementById('export-modal-close-btn').addEventListener('click', () => this.hide());
    document.getElementById('export-modal-cancel').addEventListener('click', () => this.hide());
    document.getElementById('export-modal-start').addEventListener('click', () => {
      const resVal = document.getElementById('export-select-resolution').value;
      const [w, h] = resVal.split('x').map(Number);
      const format = document.querySelector('input[name="export-format"]:checked')?.value || 'mp4';
      const includeBgm = document.getElementById('export-include-bgm').checked;

      this.hide();
      this.onConfirm({ width: w, height: h, format, includeBgm });
    });
  }

  show() {
    this.modalEl.classList.remove('hidden');
  }

  hide() {
    this.modalEl.classList.add('hidden');
  }
}
