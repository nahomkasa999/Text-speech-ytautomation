/**
 * Speech speed and natural paragraph/sentence pause sliders.
 */

export function setupPauseAndSpeedControls({ el, state, sessionsManager, callbacks }) {
  el.speedSlider.addEventListener('input', (e) => {
    state.speed = parseFloat(e.target.value);
    el.speedVal.textContent = `${state.speed.toFixed(2)}x`;
    callbacks.refreshStats();
    callbacks.debouncedSaveDraft();
  });

  el.pauseParaSlider.addEventListener('input', (e) => {
    state.paragraphPause = parseFloat(e.target.value);
    el.pauseParaVal.textContent = `${state.paragraphPause.toFixed(1)}s`;
    if (state.activeSession && (!state.activeSession.synced_segments || state.activeSession.synced_segments.length === 0)) {
      sessionsManager.buildSyncedSegments(state.activeSession.text, state.activeSession.duration_seconds, state.paragraphPause, state.sentencePause);
      callbacks.buildTimeline();
      callbacks.renderVideoFrame();
    }
    callbacks.debouncedSaveDraft();
  });

  el.pauseSentSlider.addEventListener('input', (e) => {
    state.sentencePause = parseFloat(e.target.value);
    el.pauseSentVal.textContent = `${state.sentencePause.toFixed(2)}s`;
    if (state.activeSession && (!state.activeSession.synced_segments || state.activeSession.synced_segments.length === 0)) {
      sessionsManager.buildSyncedSegments(state.activeSession.text, state.activeSession.duration_seconds, state.paragraphPause, state.sentencePause);
      callbacks.buildTimeline();
      callbacks.renderVideoFrame();
    }
    callbacks.debouncedSaveDraft();
  });
}
