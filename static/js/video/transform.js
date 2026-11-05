/**
 * Geometric Transformations: resize handle math, aspect ratio, and rotation.
 */

export function computeResize({ initialBounds, handle, deltaX, deltaY, shiftKey, altKey }) {
  const { x, y, width, height } = initialBounds;
  const minSize = 25;

  let newX = x;
  let newY = y;
  let newW = width;
  let newH = height;

  if (handle.includes('e')) newW = Math.max(minSize, width + deltaX);
  if (handle.includes('w')) {
    newW = Math.max(minSize, width - deltaX);
    newX = x + (width - newW);
  }
  if (handle.includes('s')) newH = Math.max(minSize, height + deltaY);
  if (handle.includes('n')) {
    newH = Math.max(minSize, height - deltaY);
    newY = y + (height - newH);
  }

  if (shiftKey) {
    const aspect = width / height;
    if (handle === 'e' || handle === 'w') newH = newW / aspect;
    else if (handle === 'n' || handle === 's') newW = newH * aspect;
    else newH = newW / aspect;
  }

  if (altKey) {
    newX = x - (newW - width);
    newY = y - (newH - height);
    newW = width + (newW - width) * 2;
    newH = height + (newH - height) * 2;
  }

  return {
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(newW),
    height: Math.round(newH)
  };
}

export function computeRotation({ layer, rect, clientX, clientY, initialRotation, startPointerAngle, shiftKey }) {
  const cx = rect.left + ((layer.x + layer.width / 2) / 1920) * rect.width;
  const cy = rect.top + ((layer.y + layer.height / 2) / 1080) * rect.height;
  const currentAngle = Math.atan2(clientY - cy, clientX - cx);
  let deg = initialRotation + ((currentAngle - startPointerAngle) * 180) / Math.PI;

  if (shiftKey) {
    deg = Math.round(deg / 15) * 15;
  }
  return Math.round(deg) % 360;
}
