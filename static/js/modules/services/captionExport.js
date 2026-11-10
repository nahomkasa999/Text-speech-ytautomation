/**
 * Caption export: turns the narration's synced segments into a .srt file
 * that can be uploaded next to the audio/video (YouTube, players, editors).
 */

import { saveBlob } from './fileSaver.js';
import { showToast } from '../ui/toast.js';

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

/** 83.456 -> "00:01:23,456" (SRT timestamp). */
export function formatSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Build SRT text from [{start, end, speech_end?, text}]. Returns '' if nothing usable. */
export function segmentsToSrt(segments) {
  if (!Array.isArray(segments)) return '';
  const cues = [];
  segments.forEach((seg) => {
    const text = String((seg && seg.text) || '').replace(/\s*\n\s*/g, ' ').trim();
    if (!text) return;
    const start = Number(seg.start) || 0;
    // Hide the silent pause after the sentence: end the cue when speech ends.
    const rawEnd = Number(seg.speech_end);
    const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : Number(seg.end);
    cues.push({ start, end: end > start ? end : start + 0.5, text });
  });
  return cues
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

/** Click handler for the "Download captions" button. */
export function attachCaptionDownload(buttonEl, getSegments, getFilename) {
  if (!buttonEl) return;
  buttonEl.addEventListener('click', async (e) => {
    e.preventDefault();
    const srt = segmentsToSrt(getSegments());
    if (!srt) {
      showToast('Generate a narration first to get captions.', 'info');
      return;
    }
    const blob = new Blob([srt], { type: 'application/x-subrip;charset=utf-8' });
    await saveBlob(blob, getFilename());
  });
}
