import { renderScene } from './renderer.js';
import { getCaptionPages, findPageAt } from './captionPagination.js';
import { ambientBounds } from './ambientWidgets.js';

const CACHE_LIMIT = 64 * 1024 * 1024;

function active(layer, time) {
  return layer.visible && (layer.type === 'transcription' || layer.type === 'audio_widget' ||
    layer.id === 'layer_captions' || layer.id === 'layer_player_widget' ||
    (time >= (layer.startTime ?? 0) && time <= (layer.endTime ?? 999999)));
}

function changing(layer) {
  return layer.type === 'video' || layer.type === 'audio_widget' || layer.id === 'layer_player_widget' ||
    layer.fadeIn !== undefined || layer.fadeOut !== undefined || !!layer.transition ||
    (layer.type === 'frame' && layer.children?.length);
}

// The scene-space box a changing layer stays inside, or null when it may paint anywhere.
function reach(layer, scale) {
  return layer.type === 'audio_widget' && !layer.rotation ? ambientBounds(layer, scale) : null;
}

function union(a, b) {
  if (!a || !b) return a || b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function abortError() {
  return new DOMException('Export cancelled', 'AbortError');
}

function checkAbort(signal) {
  if (signal.aborted) throw abortError();
}

function waitForMedia(element, event, signal) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error(`Could not load export media: ${element.currentSrc || element.src}`)); };
    const aborted = () => { cleanup(); reject(abortError()); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error(`Timed out loading export media: ${element.currentSrc || element.src}`)); }, 30000);
    const cleanup = () => {
      clearTimeout(timeout);
      element.removeEventListener(event, done);
      element.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    if (signal.aborted) { aborted(); return; }
    element.addEventListener(event, done, { once: true });
    element.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
  });
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(abortError());
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function prepareLayer(layer, original, signal, videos) {
  checkAbort(signal);
  if (!layer.visible) return;
  if (layer.type === 'image') {
    if (original._loadedImage && original._loadingSrc !== undefined && original._loadingSrc !== layer.src) {
    } else if (original._loadedImage && (!original._loadedImage.src || original._loadedImage.src === new URL(layer.src, document.baseURI).href)) {
      layer._loadedImage = original._loadedImage;
      return;
    }
    if (layer.src) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      const loaded = waitForMedia(image, 'load', signal);
      image.src = layer.src;
      await loaded;
      layer._loadedImage = image;
    }
  } else if (layer.type === 'video' && layer.src) {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    videos.push(video);
    const loaded = waitForMedia(video, 'loadeddata', signal);
    video.src = layer.src;
    video.load();
    await loaded;
    layer._videoEl = video;
    layer._exportSeeking = true;
  }
}

async function seekVideo(layer, time, signal) {
  checkAbort(signal);
  const video = layer._videoEl;
  if (!video) return;
  let target = Math.max(0, time - (layer.startTime || 0));
  if (Number.isFinite(video.duration)) target = Math.min(target, Math.max(0, video.duration - 0.001));
  if (Math.abs(video.currentTime - target) < 0.00001 && video.readyState >= 2 && !video.seeking) return;
  const sought = waitForMedia(video, 'seeked', signal);
  video.currentTime = target;
  await sought;
  if (video.readyState < 2) await waitForMedia(video, 'loadeddata', signal);
}

export async function createExportRenderer(source, { width, height, bgImage = null, signal }) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const exportSignal = controller.signal;
  const videos = [];
  const releaseVideos = () => {
    for (const video of videos) { video.pause(); video.removeAttribute('src'); video.load(); }
    videos.length = 0;
  };
  checkAbort(exportSignal);
  const scene = source.clone();
  source.layers.forEach((original, i) => {
    for (const [key, value] of Object.entries(original)) {
      if (key.startsWith('_') || typeof value === 'function') continue;
      scene.layers[i][key] = structuredClone(value);
    }
    scene.layers[i]._exportMemoizeLayout = true;
  });
  if (source.voiceEnvelope) scene.voiceEnvelope = structuredClone(source.voiceEnvelope);
  try {
    if (bgImage?.tagName === 'IMG') {
      if (!bgImage.complete) await waitForMedia(bgImage, 'load', exportSignal);
      if (!bgImage.naturalWidth) throw new Error('Could not load export background image');
    }
    if (document.fonts) {
      await abortable(Promise.all(scene.layers.filter(layer => layer.fontFamily).map(layer =>
        document.fonts.load(`${layer.fontWeight || '700'} ${layer.fontSize || 48}px ${layer.fontFamily}`))), exportSignal);
      await abortable(document.fonts.ready, exportSignal);
    }
  } catch (error) {
    controller.abort();
    releaseVideos();
    signal?.removeEventListener('abort', cancel);
    throw error;
  }

  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d');
  const bytes = width * height * 4;
  const stats = { draws: 0, cacheHits: 0, cachedBytes: 0, fullFrames: 0 };
  const whole = { x: 0, y: 0, width, height };
  const scaleX = width / scene.canvas.width;
  const scaleY = height / scene.canvas.height;
  const pixelBox = box => {
    const x = Math.max(0, Math.floor(box.x * scaleX));
    const y = Math.max(0, Math.floor(box.y * scaleY));
    const right = Math.min(width, Math.ceil((box.x + box.width) * scaleX));
    const bottom = Math.min(height, Math.ceil((box.y + box.height) * scaleY));
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
  };
  // The canvas keeps the previous frame, so a frame repaints only what changed since.
  let stale = true;
  let moved = null;
  const groups = [];
  for (const layer of scene.layers) {
    const dynamic = changing(layer);
    const caption = layer.type === 'transcription' || layer.id === 'layer_captions';
    const last = groups[groups.length - 1];
    if (!dynamic && !caption && last && !last.dynamic && !last.caption) last.layers.push(layer);
    else groups.push({ layers: [layer], dynamic, caption, bitmap: null, key: null, shown: null });
  }
  const transparentCanvas = { ...scene.canvas, background: null };
  const drawSubset = (target, layers, time, background = false, clip = whole) => {
    const subset = Object.create(scene);
    subset.layers = layers;
    subset.canvas = background ? scene.canvas : transparentCanvas;
    // Child lookup must use the complete frozen scene, not the subset.
    subset.getLayer = scene.getLayer.bind(scene);
    const context = target.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.beginPath();
    context.rect(clip.x, clip.y, clip.width, clip.height);
    context.clip();
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    renderScene(context, subset, { currentTime: time, bgImage: background ? bgImage : null });
    context.restore();
    stats.draws++;
  };
  const invalidateFonts = () => {
    stale = true;
    for (const group of groups) group.key = null;
    for (const layer of scene.layers) layer._captionPageCache = null;
  };
  document.fonts?.addEventListener('loadingdone', invalidateFonts);
  let background = null;
  if (bytes <= CACHE_LIMIT) {
    background = canvasOf(width, height);
    drawSubset(background, [], 0, true);
    stats.cachedBytes += bytes;
  }
  const scratch = canvasOf(width, height);
  let disposed = false;

  function captionKey(layer, time) {
    const segments = scene.syncedSegments?.length ? scene.syncedSegments : [{ start: 0, end: 0, text: layer.text || '' }];
    return findPageAt(getCaptionPages(ctx, layer, segments), time)?.text || '';
  }

  return {
    canvas, stats,
    async renderFrame(time) {
      if (disposed) throw new Error('Export renderer is disposed');
      checkAbort(exportSignal);
      for (let i = 0; i < scene.layers.length; i++) {
        const layer = scene.layers[i];
        if (!active(layer, time)) {
          layer._loadedImage = null;
          if (layer._videoEl) {
            const video = layer._videoEl;
            video.pause(); video.removeAttribute('src'); video.load();
            videos.splice(videos.indexOf(video), 1);
            layer._videoEl = null;
          }
          continue;
        }
        if ((layer.type === 'image' && !layer._loadedImage) || (layer.type === 'video' && !layer._videoEl)) {
          await prepareLayer(layer, source.layers[i], exportSignal, videos);
        }
        if (layer.type === 'video') await seekVideo(layer, time, exportSignal);
      }
      const shown = groups.map(group => {
        const visible = group.layers.filter(layer => active(layer, time));
        const key = !visible.length ? null
          : group.caption ? captionKey(visible[0], time) : visible.map(layer => layer.id).join('\0');
        return { group, visible, key };
      });
      let full = stale || !background;
      let moving = null;
      for (const { group, visible, key } of shown) {
        if (key !== group.shown) full = true;
        if (!group.dynamic) continue;
        for (const layer of visible) {
          const box = reach(layer, Math.min(scaleX, scaleY));
          if (box) moving = union(moving, pixelBox(box));
          else full = true;
        }
      }
      // Nothing changed at all: resend one pixel so the frame still counts.
      const dirty = full ? whole : union(moving, moved) || { x: 0, y: 0, width: 1, height: 1 };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(dirty.x, dirty.y, dirty.width, dirty.height);
      ctx.clip();
      ctx.clearRect(dirty.x, dirty.y, dirty.width, dirty.height);
      if (background) ctx.drawImage(background, 0, 0);
      else { drawSubset(scratch, [], time, true); ctx.drawImage(scratch, 0, 0); }
      for (const { group, visible, key } of shown) {
        group.shown = key;
        if (!visible.length) continue;
        if (!group.dynamic && group.bitmap && group.key === key) {
          stats.cacheHits++;
          ctx.drawImage(group.bitmap, 0, 0);
          continue;
        }
        if (!group.dynamic && !group.bitmap && stats.cachedBytes + bytes <= CACHE_LIMIT) {
          group.bitmap = canvasOf(width, height);
          stats.cachedBytes += bytes;
        }
        const target = group.bitmap || scratch;
        // A cached bitmap is reused on later frames, so it is always drawn whole.
        drawSubset(target, visible, time, false, group.bitmap ? whole : dirty);
        group.key = key;
        ctx.drawImage(target, 0, 0);
      }
      ctx.restore();
      stale = false;
      moved = moving;
      if (full) stats.fullFrames++;
      return dirty;
    },
    repeatFrames(frameIndex, totalFrames, fps, speed) {
      const time = frameIndex / fps * speed;
      if (scene.layers.some(layer => active(layer, time) && changing(layer))) return 1;
      const state = scene.layers.map(layer => active(layer, time));
      const captions = scene.layers.map((layer, i) => state[i] && (layer.type === 'transcription' || layer.id === 'layer_captions') ? captionKey(layer, time) : null);
      let count = 1;
      while (count < 300 && frameIndex + count < totalFrames) {
        const next = (frameIndex + count) / fps * speed;
        if (scene.layers.some((layer, i) => active(layer, next) !== state[i] ||
          (captions[i] !== null && captionKey(layer, next) !== captions[i]))) break;
        count++;
      }
      return count;
    },
    dispose() {
      disposed = true;
      document.fonts?.removeEventListener('loadingdone', invalidateFonts);
      controller.abort();
      signal?.removeEventListener('abort', cancel);
      releaseVideos();
      for (const group of groups) if (group.bitmap) { group.bitmap.width = 0; group.bitmap.height = 0; group.bitmap = null; }
      if (background) { background.width = 0; background.height = 0; background = null; }
      scratch.width = 0; scratch.height = 0;
      stats.cachedBytes = 0;
    }
  };
}
