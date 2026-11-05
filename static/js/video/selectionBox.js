/**
 * Selection Box Handles and DOM Positioning.
 */

export function setupSelectionHandles(selectionBoxEl, sizeBadgeEl) {
  selectionBoxEl.innerHTML = '';

  const tagEl = document.createElement('div');
  tagEl.className = 'selection-tag';
  tagEl.textContent = 'Layer';
  selectionBoxEl.appendChild(tagEl);

  const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  handlePositions.forEach(pos => {
    const h = document.createElement('div');
    h.className = `handle ${pos}`;
    h.dataset.handle = pos;
    selectionBoxEl.appendChild(h);
  });

  const rotatePositions = ['nw', 'ne', 'se', 'sw'];
  rotatePositions.forEach(pos => {
    const r = document.createElement('div');
    r.className = `rotate-zone ${pos}`;
    r.dataset.rotate = pos;
    selectionBoxEl.appendChild(r);
  });

  selectionBoxEl.appendChild(sizeBadgeEl);
  return tagEl;
}

export function positionSelectionBox(selectionBoxEl, tagEl, scene) {
  const layer = scene.getSelectedLayer();
  if (!layer || !layer.visible) {
    selectionBoxEl.classList.add('hidden');
    return;
  }

  const canvasW = scene.canvas.width || 1920;
  const canvasH = scene.canvas.height || 1080;

  let boxY = layer.y;
  let boxH = Math.max(20, layer.height || 40);

  if ((layer.type === 'transcription' || layer.verticalAlign === 'middle') &&
      typeof layer.renderedTop === 'number' && typeof layer.renderedHeight === 'number') {
    boxY = layer.renderedTop;
    boxH = Math.max(20, layer.renderedHeight);
  }

  selectionBoxEl.classList.remove('hidden');
  selectionBoxEl.style.left = `${(layer.x / canvasW) * 100}%`;
  selectionBoxEl.style.top = `${(boxY / canvasH) * 100}%`;
  selectionBoxEl.style.width = `${(layer.width / canvasW) * 100}%`;
  selectionBoxEl.style.height = `${(boxH / canvasH) * 100}%`;
  selectionBoxEl.style.transform = layer.rotation ? `rotate(${layer.rotation}deg)` : 'none';

  if (tagEl) {
    tagEl.textContent = layer.name || 'Layer';
  }
}
