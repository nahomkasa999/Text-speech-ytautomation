/**
 * Timeline Tracks and Playhead Position Synchronizer.
 */

import { formatTimecode } from '../../ui/timeFormat.js';

export function renderSubtitleBlocks(laneSubtitlesEl, syncedSegments, duration) {
  const dur = duration || 10;
  if (!laneSubtitlesEl) return;
  laneSubtitlesEl.innerHTML = '';

  syncedSegments.forEach((seg, idx) => {
    const block = document.createElement('div');
    block.className = 'caption-block';
    const startPct = (seg.start / dur) * 100;
    const widthPct = ((seg.end - seg.start) / dur) * 100;
    block.style.left = `${startPct}%`;
    block.style.width = `${Math.max(2, widthPct)}%`;
    block.textContent = seg.text;
    block.title = seg.text;
    block.dataset.idx = idx;
    laneSubtitlesEl.appendChild(block);
  });
}

export function renderMediaClips(laneMediaEl, layers, duration, onSelectClip) {
  if (!laneMediaEl) return;
  const dur = duration || 10;
  laneMediaEl.innerHTML = '';

  const mediaLayers = layers.filter(l => (l.type === 'image' || l.type === 'video' || l.type === 'text') && l.id !== 'layer_captions');
  mediaLayers.forEach(l => {
    const start = l.startTime || 0;
    const end = l.endTime || dur;
    const block = document.createElement('div');
    block.className = `media-clip-block clip-${l.type}`;
    block.style.left = `${(start / dur) * 100}%`;
    block.style.width = `${Math.max(3, ((end - start) / dur) * 100)}%`;
    const icon = l.type === 'video' ? '🎬' : (l.type === 'image' ? '🖼️' : '📝');
    block.innerHTML = `<span class="clip-icon">${icon}</span> <span class="clip-name">${l.name || l.type}</span>`;
    block.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelectClip?.(l.id);
    });
    laneMediaEl.appendChild(block);
  });
}

export function updatePlayheadPosition({
  cur, dur,
  timelineViewportEl,
  timelinePlayheadEl,
  videoTimecodeEl,
  laneSubtitlesEl,
  syncedSegments
}) {
  const laneWidth = timelineViewportEl.clientWidth - 90;
  const pct = Math.min(1, Math.max(0, cur / (dur || 1)));
  const leftPx = 90 + (pct * laneWidth);
  timelinePlayheadEl.style.left = `${leftPx}px`;

  const timeStr = `${formatTimecode(cur)} / ${formatTimecode(dur)}`;
  videoTimecodeEl.textContent = timeStr;

  const zenTimecode = document.getElementById('zen-timecode');
  if (zenTimecode) zenTimecode.textContent = timeStr;

  if (laneSubtitlesEl) {
    const blocks = laneSubtitlesEl.querySelectorAll('.caption-block');
    syncedSegments.forEach((seg, i) => {
      if (blocks[i]) {
        blocks[i].classList.toggle('active', cur >= seg.start && cur <= seg.end);
      }
    });
  }
}
