/**
 * Wave animation colours in the inspector:
 *  - one main colour (any colour, with a few quick presets),
 *  - "Match layer colours automatically": layer colours derived from it,
 *  - per-layer colour pickers (editing one switches to manual),
 *  - a Glow slider.
 */

import { STYLE_LAYERS, autoPalette, layerColors } from '../../../video/ambientWidgets.js';

const getWidget = (scene) => scene.getLayer('layer_player_widget') || scene.layers.find(l => l.type === 'audio_widget');

/** Refresh the controls from the widget layer (call when it is selected or its style changes). */
export function syncWaveColorControls(scene) {
  const w = getWidget(scene);
  if (!w) return;
  const picker = document.getElementById('wave-color-picker');
  if (picker) picker.value = w.color || '#111827';
  const auto = document.getElementById('wave-auto-colors');
  if (auto) auto.checked = w.autoPalette !== false;
  const hint = document.getElementById('wave-layers-hint');
  if (hint) hint.textContent = w.autoPalette !== false ? 'from the main colour' : 'set by hand';
  const glowSlider = document.getElementById('wave-glow-slider');
  const glowVal = document.getElementById('wave-glow-val');
  const glowPct = Math.round((w.glow || 0) * 100);
  if (glowSlider) glowSlider.value = glowPct;
  if (glowVal) glowVal.textContent = `${glowPct}%`;
  document.querySelectorAll('[data-wave-color]').forEach(b =>
    b.classList.toggle('active', (b.dataset.waveColor || '').toLowerCase() === (w.color || '').toLowerCase()));

  const row = document.getElementById('wave-layer-colors');
  if (!row) return;
  const colors = layerColors(w);
  row.innerHTML = '';
  colors.forEach((c, i) => {
    const label = document.createElement('label');
    label.className = 'wave-layer-swatch';
    label.title = `Layer ${i + 1}${i === 0 ? ' (main)' : ''}`;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = c;
    input.dataset.layerIndex = String(i);
    const num = document.createElement('span');
    num.textContent = String(i + 1);
    label.append(input, num);
    row.appendChild(label);
  });
}

export function setupWaveColorControls({ scene, callbacks }) {
  const changed = () => {
    syncWaveColorControls(scene);
    callbacks.renderVideoFrame();
    callbacks.debouncedSaveDraft();
  };

  const setMainColor = (hex) => {
    const w = getWidget(scene);
    if (!w) return;
    w.color = hex;
    if (w.autoPalette === false) {
      // Manual mode: the main colour is layer 1; keep the other hand-picked layers.
      w.palette = [hex, ...(w.palette || []).slice(1)];
    }
    changed();
  };

  document.getElementById('wave-color-picker')?.addEventListener('input', (e) => setMainColor(e.target.value));
  document.querySelectorAll('[data-wave-color]').forEach(btn =>
    btn.addEventListener('click', () => setMainColor(btn.dataset.waveColor)));

  document.getElementById('wave-auto-colors')?.addEventListener('change', (e) => {
    const w = getWidget(scene);
    if (!w) return;
    if (e.target.checked) {
      w.autoPalette = true;
    } else {
      // Start manual editing from the current automatic colours.
      w.palette = autoPalette(w.color || '#111827', STYLE_LAYERS[w.widgetStyle] || 3);
      w.autoPalette = false;
    }
    changed();
  });

  // Editing any layer swatch switches to manual colours.
  document.getElementById('wave-layer-colors')?.addEventListener('input', (e) => {
    const idx = Number(e.target.dataset?.layerIndex);
    const w = getWidget(scene);
    if (!w || Number.isNaN(idx)) return;
    if (w.autoPalette !== false) {
      w.palette = layerColors(w);
      w.autoPalette = false;
    }
    w.palette = layerColors(w);
    w.palette[idx] = e.target.value;
    if (idx === 0) w.color = e.target.value;
    const auto = document.getElementById('wave-auto-colors');
    if (auto) auto.checked = false;
    const hint = document.getElementById('wave-layers-hint');
    if (hint) hint.textContent = 'set by hand';
    callbacks.renderVideoFrame();
    callbacks.debouncedSaveDraft();
  });

  document.getElementById('wave-glow-slider')?.addEventListener('input', (e) => {
    const w = getWidget(scene);
    if (!w) return;
    w.glow = Number(e.target.value) / 100;
    const v = document.getElementById('wave-glow-val');
    if (v) v.textContent = `${e.target.value}%`;
    callbacks.renderVideoFrame();
    callbacks.debouncedSaveDraft();
  });
}
