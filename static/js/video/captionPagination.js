/**
 * Caption Pagination: fits synced narration into the caption box.
 *
 * Instead of showing one whole sentence at a time (which is tiny for short
 * sentences and overflows / shrinks for long ones), the narration is re-cut
 * into "pages" that fill the caption box at the chosen font size:
 *   - big box + small font  -> many words per page
 *   - small box + big font  -> few words per page (down to a single word)
 *
 * Pages inside a paragraph are balanced so their word counts differ by only
 * 1-2 words, and each page is timed from the narration segments it covers.
 * Results are cached and only recomputed when the text, box or font changes.
 */

import { formatTextCasing } from './textMeasurement.js';

const WIDTH_SAFETY = 0.99; // small margin so summed word widths never overflow real line wrapping
const PAGE_PENALTY = 1e6;  // DP: using fewer pages always beats slightly better balance

function boxMetrics(layer) {
  const fontSize = layer.fontSize || 48;
  const lineHeight = fontSize * (layer.lineHeight || 1.35);
  const maxWidth = Math.max(30, layer.width || 0) * WIDTH_SAFETY;
  const maxHeight = Math.max(lineHeight, layer.height || 0);
  const maxLines = Math.max(1, Math.floor((maxHeight + 0.5) / lineHeight));
  return { fontSize, maxWidth, maxLines };
}

/**
 * For each start word j, how many words fit on one page starting at j.
 * Uses the same greedy wrap rule as measureTextLayout, with cached word widths
 * so a whole book can be paginated in a few milliseconds.
 */
function pageCapacities(words, widthOf, spaceWidth, maxWidth, maxLines) {
  const caps = new Array(words.length);
  for (let j = 0; j < words.length; j++) {
    let lines = 1;
    let lineW = widthOf(words[j]);
    let n = 1;
    while (j + n < words.length) {
      const w = widthOf(words[j + n]);
      if (lineW + spaceWidth + w > maxWidth) {
        if (lines + 1 > maxLines) break;
        lines++;
        lineW = w;
      } else {
        lineW += spaceWidth + w;
      }
      n++;
    }
    caps[j] = n;
  }
  return caps;
}

/**
 * Splits one paragraph into the fewest pages that fit, then balances them so
 * word counts are as even as possible (typically within 1-2 words).
 */
function balancedPageSizes(caps) {
  const total = caps.length;
  let greedyPages = 0;
  for (let i = 0; i < total; i += caps[i]) greedyPages++;
  if (greedyPages <= 1) return [total];

  const target = total / greedyPages;
  const cost = new Array(total + 1).fill(Infinity);
  const prev = new Array(total + 1).fill(-1);
  cost[0] = 0;
  for (let i = 0; i < total; i++) {
    if (cost[i] === Infinity) continue;
    for (let c = 1; c <= caps[i]; c++) {
      const next = cost[i] + PAGE_PENALTY + (c - target) * (c - target);
      if (next < cost[i + c]) { cost[i + c] = next; prev[i + c] = i; }
    }
  }
  const sizes = [];
  for (let i = total; i > 0; i = prev[i]) sizes.push(i - prev[i]);
  return sizes.reverse();
}

/** Turns narration segments into a flat word list with estimated per-word timing. */
function timedWords(segments, casing) {
  const words = [];
  segments.forEach(seg => {
    const segWords = formatTextCasing(String(seg.text || ''), casing).split(/\s+/).filter(Boolean);
    if (segWords.length === 0) return;
    const start = Number(seg.start) || 0;
    const end = Number(seg.end) || start;
    const speechEnd = typeof seg.speech_end === 'number' ? Math.min(seg.speech_end, end) : end;
    const totalChars = segWords.reduce((a, w) => a + w.length + 1, 0);
    let t = start;
    segWords.forEach((w, idx) => {
      const isLast = idx === segWords.length - 1;
      const dur = ((w.length + 1) / totalChars) * Math.max(0, speechEnd - start);
      const wEnd = isLast ? end : t + dur;
      words.push({ text: w, start: t, end: wEnd, paragraphEnd: isLast && !!seg.is_paragraph_end });
      t = wEnd;
    });
  });
  return words;
}

function splitIntoParagraphs(words) {
  const paragraphs = [];
  let cur = [];
  words.forEach(w => {
    cur.push(w);
    if (w.paragraphEnd) { paragraphs.push(cur); cur = []; }
  });
  if (cur.length) paragraphs.push(cur);
  return paragraphs;
}

export function paginateCaptions(ctx, layer, segments) {
  const { fontSize, maxWidth, maxLines } = boxMetrics(layer);
  ctx.save();
  ctx.font = `${layer.fontWeight || '700'} ${fontSize}px ${layer.fontFamily || "'Merriweather', serif"}`;
  const widthCache = new Map();
  const widthOf = (w) => {
    let v = widthCache.get(w);
    if (v === undefined) { v = ctx.measureText(w).width; widthCache.set(w, v); }
    return v;
  };
  const spaceWidth = ctx.measureText('a a').width - 2 * ctx.measureText('a').width;

  const pages = [];
  splitIntoParagraphs(timedWords(segments, layer.casing)).forEach(para => {
    const caps = pageCapacities(para.map(w => w.text), widthOf, spaceWidth, maxWidth, maxLines);
    let i = 0;
    balancedPageSizes(caps).forEach(n => {
      const slice = para.slice(i, i + n);
      pages.push({
        start: slice[0].start,
        end: slice[slice.length - 1].end,
        text: slice.map(w => w.text).join(' ')
      });
      i += n;
    });
  });

  ctx.restore();
  return pages;
}

function cacheKey(layer, segments) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  return [
    segments.length, first?.text, first?.start, last?.text, last?.end,
    Math.round(layer.width), Math.round(layer.height), layer.fontSize, layer.fontFamily,
    layer.fontWeight, layer.lineHeight, layer.casing
  ].join('|');
}

/** Returns cached caption pages for this layer, recomputing only when inputs change. */
export function getCaptionPages(ctx, layer, segments) {
  const key = cacheKey(layer, segments);
  const cache = layer._captionPageCache;
  if (cache && cache.segments === segments && cache.key === key) return cache.pages;
  const pages = paginateCaptions(ctx, layer, segments);
  layer._captionPageCache = { segments, key, pages };
  return pages;
}

/** Picks the page that should be on screen at `time` (holds the nearest page in gaps). */
export function findPageAt(pages, time) {
  if (!pages.length) return null;
  if (time <= pages[0].start) return pages[0];
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pages[mid].start <= time) lo = mid; else hi = mid - 1;
  }
  return pages[lo];
}
