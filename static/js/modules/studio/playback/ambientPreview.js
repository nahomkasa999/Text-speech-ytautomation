/**
 * Keeps "always moving" player animations alive in the editor preview while
 * the video is paused, so you can see the motion before exporting.
 * Runs at ~30 fps only when an ambient style is visible in the Video Studio.
 */

import { isAmbientStyle } from '../../../video/ambientWidgets.js';

export function startAmbientPreview({ el, state, scene, renderVideoFrame }) {
  let last = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    if (now - last < 33) return;
    last = now;
    const widget = scene.getLayer('layer_player_widget');
    if (!widget || !widget.visible || !isAmbientStyle(widget.widgetStyle)) return;
    if (state.video.isPlaying || state.video.isExporting || document.hidden) return;
    if (el.videoStudioView?.classList.contains('hidden')) return;
    scene.ambientClock = now / 1000;
    try {
      renderVideoFrame();
    } finally {
      scene.ambientClock = undefined;
    }
  };
  requestAnimationFrame(tick);
}
