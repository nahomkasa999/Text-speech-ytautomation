/**
 * Canvas coordinate conversion and layer hit-testing.
 */

export function clientToCanvas(clientX, clientY, canvasEl, scene) {
  const rect = canvasEl.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * (scene.canvas.width || 1920),
    y: ((clientY - rect.top) / rect.height) * (scene.canvas.height || 1080)
  };
}

export function hitTest(canvasX, canvasY, scene) {
  const pad = 15;
  for (let i = scene.layers.length - 1; i >= 0; i--) {
    const layer = scene.layers[i];
    if (!layer.visible || layer.locked) continue;
    let px = canvasX, py = canvasY;
    if (layer.rotation) {
      const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
      const rad = (-layer.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const dx = canvasX - cx, dy = canvasY - cy;
      px = cx + (dx * cos - dy * sin);
      py = cy + (dx * sin + dy * cos);
    }
    const top = (typeof layer.renderedTop === 'number') ? layer.renderedTop : layer.y;
    const layerH = (typeof layer.renderedHeight === 'number') ? layer.renderedHeight : Math.max(25, layer.height || 40);
    if (px >= layer.x - pad && px <= layer.x + layer.width + pad &&
        py >= top - pad && py <= top + layerH + pad) {
      return layer;
    }
  }
  return null;
}
