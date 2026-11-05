/**
 * Timeline Ruler: builds time markers and step ticks.
 */

import { formatDuration } from '../../ui/timeFormat.js';

export function buildTimelineRuler(timelineRulerEl, duration) {
  const dur = duration || 10;
  timelineRulerEl.innerHTML = '';

  const step = dur > 60 ? 10 : (dur > 20 ? 5 : 2);
  for (let t = 0; t <= dur + step; t += step) {
    const tick = document.createElement('div');
    tick.className = 'ruler-tick';
    const pct = (t / dur) * 100;
    tick.style.left = `${pct}%`;
    tick.textContent = formatDuration(t);
    timelineRulerEl.appendChild(tick);
  }
}
