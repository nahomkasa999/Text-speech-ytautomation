/**
 * Project Serializer: save and continue editing video projects (.videoproj).
 */

import { showToast } from '../../ui/toast.js';

export class ProjectSerializer {
  constructor({ scene, el, state, callbacks }) {
    this.scene = scene;
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;

    this.attachEvents();
  }

  attachEvents() {
    const btnSave = document.getElementById('btn-save-project');
    const btnLoad = document.getElementById('btn-load-project');
    const fileLoader = document.getElementById('project-file-loader');

    if (btnSave) btnSave.addEventListener('click', () => this.saveProjectToFile());
    if (btnLoad && fileLoader) {
      btnLoad.addEventListener('click', () => fileLoader.click());
      fileLoader.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.loadProjectFromFile(file);
      });
    }
  }

  serialize() {
    return {
      version: '2.0',
      created: new Date().toISOString(),
      title: this.state.activeSession?.title || this.el.projectTitle?.value || 'Untitled Project',
      canvas: this.scene.canvas,
      layers: this.scene.layers.map(l => {
        const copy = { ...l };
        delete copy._loadedImage;
        delete copy._videoEl;
        return copy;
      }),
      bgImageUrl: this.state.video.bgImageUrl,
      audioUrl: this.state.activeSession?.audio_url || this.el.videoAudioPlayer?.src || '',
      syncedSegments: this.state.video.syncedSegments || [],
      bgm: this.state.video.bgm || null,
      audioSpeed: this.state.video.audioSpeed || 1,
      audioVolume: this.state.video.audioVolume || 1
    };
  }

  saveProjectToFile() {
    const data = this.serialize();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.title.replace(/[^a-z0-9_-]/gi, '_')}.videoproj`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    showToast('Project file downloaded!', 'success');
  }

  async loadProjectFromFile(file) {
    try {
      const text = await file.text();
      const project = JSON.parse(text);
      if (!project.layers || !Array.isArray(project.layers)) {
        throw new Error('Invalid project file format.');
      }

      this.scene.layers = [];
      project.layers.forEach(l => this.scene.addLayer(l));

      if (project.canvas) this.scene.canvas = project.canvas;
      if (project.bgm) this.callbacks.loadBgm?.(project.bgm.url, project.bgm.name);
      if (project.bgImageUrl) this.callbacks.loadBgTemplate?.(project.bgImageUrl, false);
      if (project.audioUrl && this.el.videoAudioPlayer) {
        this.el.videoAudioPlayer.src = project.audioUrl;
      }
      if (project.syncedSegments) {
        this.state.video.syncedSegments = project.syncedSegments;
        this.scene.syncedSegments = project.syncedSegments;
      }

      this.callbacks.renderLayersList?.();
      this.callbacks.buildTimeline?.();
      this.callbacks.renderVideoFrame?.();
      showToast(`Loaded project: ${project.title}`, 'success');
    } catch (err) {
      showToast(`Failed to open project: ${err.message}`, 'error');
    }
  }
}
