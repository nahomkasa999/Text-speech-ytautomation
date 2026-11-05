/**
 * Figma-style Smart Snapping and Guide Lines.
 */

export function snapAxis(val, size, axis, scene, dragTarget, snapThreshold, guidesCtx) {
  const canvasLimit = axis === 'x' ? 1920 : 1080;
  const canvasCenter = canvasLimit / 2;
  const valCenter = val + size / 2;
  const valEnd = val + size;

  const targets = [0, canvasCenter, canvasLimit];

  scene.layers.forEach(l => {
    if (l.id === dragTarget?.id || !l.visible) return;
    const lPos = axis === 'x' ? l.x : l.y;
    const lSize = axis === 'x' ? l.width : l.height;
    targets.push(lPos, lPos + lSize / 2, lPos + lSize);
  });

  for (const target of targets) {
    if (Math.abs(val - target) < snapThreshold) {
      drawGuideLine(guidesCtx, axis, target);
      return target;
    }
    if (Math.abs(valCenter - target) < snapThreshold) {
      drawGuideLine(guidesCtx, axis, target);
      return target - size / 2;
    }
    if (Math.abs(valEnd - target) < snapThreshold) {
      drawGuideLine(guidesCtx, axis, target);
      return target - size;
    }
  }

  clearGuides(guidesCtx);
  return val;
}

export function drawGuideLine(ctx, axis, pos) {
  ctx.clearRect(0, 0, 1920, 1080);
  ctx.save();
  ctx.strokeStyle = '#F24822';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  if (axis === 'x') {
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, 1080);
  } else {
    ctx.moveTo(0, pos);
    ctx.lineTo(1920, pos);
  }
  ctx.stroke();
  ctx.restore();
}

export function clearGuides(ctx) {
  ctx.clearRect(0, 0, 1920, 1080);
}
