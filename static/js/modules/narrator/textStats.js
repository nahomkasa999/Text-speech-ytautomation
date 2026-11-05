/**
 * Text Statistics: counts words, characters, and estimates reading duration.
 */

export function updateTextStats(bookTextEl, speed, statWordsEl, statCharsEl, statTimeEl) {
  const text = bookTextEl.value.trim();
  const chars = text.length;
  const words = text ? text.split(/\s+/).length : 0;
  const wordsPerMinute = 150 * speed;
  const totalMinutes = words > 0 ? Math.ceil(words / wordsPerMinute) : 0;

  if (statWordsEl) statWordsEl.textContent = words.toLocaleString();
  if (statCharsEl) statCharsEl.textContent = chars.toLocaleString();
  if (statTimeEl) {
    statTimeEl.textContent = totalMinutes < 60
      ? `~${totalMinutes}m`
      : `~${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }
}
