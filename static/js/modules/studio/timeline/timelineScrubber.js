/**
 * Timeline Scrubber: click-to-seek and track navigation.
 */

export function setupTimelineScrubber({ timelineViewportEl, videoAudioPlayer, onSeek }) {
  timelineViewportEl.addEventListener('click', (e) => {
    const rect = timelineViewportEl.getBoundingClientRect();
    const trackOffsetX = 90;
    const clickX = e.clientX - rect.left - trackOffsetX;
    const laneWidth = rect.width - trackOffsetX;
    if (clickX >= 0 && laneWidth > 0) {
      const dur = videoAudioPlayer.duration || 10;
      const targetTime = Math.max(0, Math.min(dur, (clickX / laneWidth) * dur));
      videoAudioPlayer.currentTime = targetTime;
      onSeek?.(targetTime, dur);
    }
  });
}
