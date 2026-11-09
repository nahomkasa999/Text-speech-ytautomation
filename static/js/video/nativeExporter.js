import { createExportRenderer } from './exportRenderer.js';
import { ExportCancelledError } from './exporter.js';

export function hasNativeExport() {
  return typeof window.pywebview?.api?.prepare_video_export === 'function';
}

async function requestJob(id, suffix, options = {}) {
  const response = await fetch(`/api/native-export/${id}${suffix}`, options);
  const result = await response.json();
  if (!response.ok || result.ok === false || result.stage === 'failed') throw new Error(result.detail || result.error || 'Export request failed.');
  if (result.stage === 'cancelled') throw new ExportCancelledError();
  return result;
}

async function uploadMusic(id, url, signal, onProgress) {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error('Background music could not be read.');
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let pos = 0; pos < value.length; pos += 4 * 1024 * 1024) {
        const chunk = value.subarray(pos, pos + 4 * 1024 * 1024);
        await requestJob(id, `/music?offset=${offset}`, { method: 'PUT', body: chunk, signal });
        offset += chunk.length;
        onProgress({ stage: 'Preparing music', uploaded_bytes: offset });
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function exportVideoNative({ scene, bgImage, settings, musicUrl, signal, onProgress = () => {}, onFrame = () => {} }) {
  let job;
  let renderer;
  let poll;
  let polling = false;
  let complete = false;
  let renderedFrames = 0;
  const started = performance.now();
  const checkAbort = () => { if (signal.aborted) throw new ExportCancelledError(); };
  const report = (status) => onProgress({ ...status, elapsed_seconds: (performance.now() - started) / 1000 });
  const cancel = () => { if (job?.id) requestJob(job.id, '', { method: 'DELETE' }).catch(() => {}); };
  signal.addEventListener('abort', cancel);
  try {
    report({ stage: 'Choose output location' });
    job = await window.pywebview.api.prepare_video_export(settings);
    if (job.cancelled) throw new ExportCancelledError();
    if (!job.ok) throw new Error(job.error || 'Could not prepare export.');
    checkAbort();
    poll = setInterval(async () => {
      if (polling) return;
      polling = true;
      try { report(await requestJob(job.id, '/status')); } catch { /* The active request reports failures. */ }
      finally { polling = false; }
    }, 1000);
    report({ stage: 'Preparing scene', progress: 0 });
    renderer = await createExportRenderer(scene, { width: job.width, height: job.height, bgImage, signal });
    checkAbort();
    if (musicUrl) await uploadMusic(job.id, musicUrl, signal, report);
    report(await requestJob(job.id, '/start', { method: 'POST', signal }));
    const ctx = renderer.canvas.getContext('2d', { willReadFrequently: true });
    for (let index = 0; index < job.total_frames;) {
      checkAbort();
      const sourceTime = index / job.fps * settings.speed;
      await renderer.renderFrame(sourceTime);
      checkAbort();
      const repeat = renderer.repeatFrames(index, job.total_frames, job.fps, settings.speed);
      const pixels = ctx.getImageData(0, 0, job.width, job.height).data;
      const status = await requestJob(job.id, `/frame?index=${index}&repeat=${repeat}`, {
        method: 'PUT', body: pixels, signal,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      renderedFrames++;
      index += repeat;
      report(status);
      onFrame(Math.min(index / job.fps * settings.speed, job.duration * settings.speed));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    checkAbort();
    report({ stage: 'Finalizing', progress: 1 });
    const result = await requestJob(job.id, '/finish', { method: 'POST', signal });
    complete = true;
    return { ...result, rendered_frames: renderedFrames, renderer_stats: renderer.stats };
  } catch (error) {
    if (job?.id) {
      const status = await requestJob(job.id, '/status').catch(() => null);
      if (status?.stage === 'completed') {
        complete = true;
        return { ...status, rendered_frames: renderedFrames, renderer_stats: renderer?.stats };
      }
    }
    if (signal.aborted || error.name === 'AbortError') throw new ExportCancelledError();
    throw error;
  } finally {
    clearInterval(poll);
    signal.removeEventListener('abort', cancel);
    renderer?.dispose();
    if (job?.id && !complete) await requestJob(job.id, '', { method: 'DELETE' }).catch(() => {});
  }
}
