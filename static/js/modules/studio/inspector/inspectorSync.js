import { syncWaveColorControls } from './waveColors.js';
/**
 * Inspector Synchronizer: updates UI input values to reflect the active layer.
 */

export function syncInspectorFromLayer(el, scene, interactionMgr) {
  const l = scene.getSelectedLayer();
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

  el.propPosX.value = Math.round(l.x);
  el.propPosY.value = Math.round(l.y);
  el.propSizeW.value = Math.round(l.width);
  if (el.propSizeH) el.propSizeH.value = Math.round(l.height || 40);

  if (l.type === 'text') {
    el.customTextEditorGroup.classList.remove('hidden');
    el.layerContentInput.value = l.text || '';
  } else {
    el.customTextEditorGroup.classList.add('hidden');
  }

  // The whole "Text style" section only applies to text layers.
  document.getElementById('insp-text-style')?.classList.toggle('hidden', l.type === 'audio_widget');

  if (l.type === 'audio_widget') {
    el.typographySettingsGroup.classList.add('hidden');
    document.getElementById('alignment-settings-group')?.classList.add('hidden');
    document.getElementById('casing-settings-group')?.classList.add('hidden');
    document.getElementById('weight-settings-group')?.classList.add('hidden');
    el.togglePlayerWidget.checked = l.visible;

    const curStyle = l.widgetStyle || 'ambient_flow';
    syncWaveColorControls(scene);
    const syncBox = document.getElementById('toggle-widget-sync');
    if (syncBox) syncBox.checked = !!l.syncToVoice;
    // Size % = wave height relative to the default 100px.
    const sizePct = Math.round(l.height || 100);
    const sizeSlider = document.getElementById('widget-size-slider');
    if (sizeSlider) sizeSlider.value = Math.min(1000, Math.max(20, sizePct));
    const sizeVal = document.getElementById('widget-size-val');
    if (sizeVal) sizeVal.textContent = `${sizePct}%`;
    el.widgetTmplBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === curStyle);
    });
  } else {
    el.typographySettingsGroup.classList.remove('hidden');
    document.getElementById('alignment-settings-group')?.classList.remove('hidden');
    document.getElementById('casing-settings-group')?.classList.remove('hidden');
    document.getElementById('weight-settings-group')?.classList.remove('hidden');

    el.captionFontSelect.value = l.fontFamily || "'Merriweather', serif";
    el.captionSizeNum.value = l.fontSize || 54;
    el.captionColorPicker.value = l.fill || '#111827';

    el.alignBtns.forEach(b => b.classList.toggle('active', b.dataset.align === (l.align || 'left')));
    const vAlign = l.verticalAlign || (l.type === 'transcription' ? 'middle' : 'top');
    el.valignBtns.forEach(b => b.classList.toggle('active', b.dataset.valign === vAlign));
    el.casingBtns.forEach(b => b.classList.toggle('active',
      b.dataset.casing === (l.casing || 'none') ||
      (b.dataset.casing === 'normal' && l.casing === 'none') ||
      (b.dataset.casing === 'lower' && l.casing === 'lower')
    ));
    el.weightBtns.forEach(b => b.classList.toggle('active', b.dataset.weight === (String(l.fontWeight) || '700')));
  }

  el.selectionTagName.textContent = l.name;
  if (interactionMgr) interactionMgr.updateSelectionBox();
}
