/**
 * Video Studio Extensions: Media Importer, BGM, Clip Operations, Project Serializer, Text Presets.
 */

import { MediaImporter } from './media/mediaImporter.js';
import { BgmManager } from './playback/bgmManager.js';
import { ClipOperations } from './timeline/clipOperations.js';
import { ProjectSerializer } from './project/projectSerializer.js';
import { TextPresetsManager } from './textPresets.js';
import { showToast } from '../ui/toast.js';

export function setupStudioExtensions({ el, state, scene, history, canvasCtx, interactionMgr, callbacks }) {
  const bgmManager = new BgmManager({
    el, state,
    callbacks: { saveDraft: callbacks.saveDraft }
  });

  const mediaImporter = new MediaImporter({
    el, state, scene,
    callbacks: {
      onBgmLoaded: (bgm) => bgmManager.loadBgm(bgm.url, bgm.name),
      renderLayersList: callbacks.renderLayersList,
      renderVideoFrame: callbacks.renderVideoFrame,
      updateSelectionBox: () => interactionMgr.updateSelectionBox(),
      saveDraft: callbacks.saveDraft
    }
  });

  const clipOperations = new ClipOperations({
    scene, el, state,
    callbacks: {
      deleteLayer: callbacks.deleteLayer,
      renderLayersList: callbacks.renderLayersList,
      buildTimeline: callbacks.buildTimeline,
      renderVideoFrame: callbacks.renderVideoFrame,
      saveDraft: callbacks.saveDraft
    }
  });

  const projectSerializer = new ProjectSerializer({
    scene, el, state,
    callbacks: {
      loadBgm: (url, name) => bgmManager.loadBgm(url, name),
      loadBgTemplate: callbacks.loadBgTemplate,
      renderLayersList: callbacks.renderLayersList,
      buildTimeline: callbacks.buildTimeline,
      renderVideoFrame: callbacks.renderVideoFrame
    }
  });

  new TextPresetsManager({
    scene, el, canvasCtx, interactionMgr,
    callbacks: {
      renderLayersList: callbacks.renderLayersList,
      renderVideoFrame: callbacks.renderVideoFrame,
      saveDraft: callbacks.saveDraft
    }
  });

  // Undo / Redo buttons
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      if (history.canUndo()) {
        history.undo();
        callbacks.renderLayersList();
        interactionMgr.updateSelectionBox();
        callbacks.renderVideoFrame();
        showToast('Undo', 'info');
      }
    });
  }
  if (btnRedo) {
    btnRedo.addEventListener('click', () => {
      if (history.canRedo()) {
        history.redo();
        callbacks.renderLayersList();
        interactionMgr.updateSelectionBox();
        callbacks.renderVideoFrame();
        showToast('Redo', 'info');
      }
    });
  }

  return { bgmManager, mediaImporter, clipOperations, projectSerializer };
}
