/**
 * Clip and Layer Transitions (Fades and Crossfades).
 */

export function calculateClipOpacity(clip, currentTime) {
  if (currentTime < clip.start || currentTime > clip.start + clip.duration) {
    return 0;
  }
  const relTime = currentTime - clip.start;
  const remTime = clip.duration - relTime;
  let alpha = 1.0;

  const fadeIn = clip.fadeIn || (clip.transition === 'fade' ? 0.5 : 0);
  const fadeOut = clip.fadeOut || (clip.transition === 'fade' ? 0.5 : 0);

  if (fadeIn > 0 && relTime < fadeIn) {
    alpha = Math.min(alpha, Math.max(0, relTime / fadeIn));
  }
  if (fadeOut > 0 && remTime < fadeOut) {
    alpha = Math.min(alpha, Math.max(0, remTime / fadeOut));
  }
  return Math.max(0, Math.min(1, alpha));
}

export function applyLayerTransition(ctx, layer, currentTime) {
  if (layer.fadeIn !== undefined || layer.fadeOut !== undefined || layer.transition) {
    const start = layer.startTime || 0;
    const duration = layer.duration || 999999;
    const opacity = calculateClipOpacity({
      start,
      duration,
      fadeIn: layer.fadeIn || (layer.transition === 'fade' ? 0.5 : 0),
      fadeOut: layer.fadeOut || (layer.transition === 'fade' ? 0.5 : 0)
    }, currentTime);
    ctx.globalAlpha *= opacity;
  }
}
