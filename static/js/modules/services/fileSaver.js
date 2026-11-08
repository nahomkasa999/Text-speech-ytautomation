/**
 * Saving files to the user's computer.
 *
 * In the desktop app (pywebview / WebView2) normal browser downloads are
 * unreliable, so we ask Python for a native "Save As..." dialog
 * (window.pywebview.api.save_as) and it copies the file straight from disk.
 * In a regular browser we fall back to a normal download.
 */

import { showToast } from '../ui/toast.js';

function desktopApi() {
  return (window.pywebview && window.pywebview.api && window.pywebview.api.save_as) ? window.pywebview.api : null;
}

function browserDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function reportResult(res, api) {
  if (res && res.ok) {
    showToast(`Saved to ${res.path}`, 'success', {
      duration: 7000,
      actionLabel: 'Show in folder',
      onAction: () => api.reveal(res.path)
    });
    return true;
  }
  if (res && res.cancelled) return false;
  showToast(`Could not save the file: ${(res && res.error) || 'unknown error'}`, 'error');
  return false;
}

/** Save a file the app's server already has (e.g. "/audio/book.wav"). */
export async function saveServerFile(urlPath, filename) {
  const api = desktopApi();
  if (!api) {
    browserDownload(urlPath, filename);
    showToast(`Downloading ${filename}…`, 'info');
    return true;
  }
  return reportResult(await api.save_as(urlPath, filename), api);
}

/** Save a file created in the browser (exported video, project file). */
export async function saveBlob(blob, filename) {
  const api = desktopApi();
  if (!api) {
    const url = URL.createObjectURL(blob);
    browserDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast(`Downloading ${filename}…`, 'info');
    return true;
  }
  try {
    const res = await fetch('/api/temp-file', { method: 'POST', body: blob });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    const { url } = await res.json();
    return reportResult(await api.save_as(url, filename), api);
  } catch (err) {
    showToast(`Could not save the file: ${err.message}`, 'error');
    return false;
  }
}

/** Make an <a href download> link use the native Save dialog in the desktop app. */
export function attachDownloadLink(linkEl) {
  if (!linkEl) return;
  linkEl.addEventListener('click', (e) => {
    const href = linkEl.getAttribute('href');
    if (!href || href === '#') {
      e.preventDefault();
      showToast('Generate a narration first.', 'info');
      return;
    }
    e.preventDefault();
    saveServerFile(href, linkEl.getAttribute('download') || href.split('/').pop());
  });
}
