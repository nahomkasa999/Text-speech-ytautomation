/**
 * In-app updates UI: the "Update available" pop-up and the Settings panel
 * with "Check for updates". The work happens in Python (src/updater.py).
 *
 * - On launch: confirm this version works (cancels automatic rollback), then
 *   check for updates. If one exists, ask. "Later" asks again next launch.
 * - While open: re-check every few hours.
 * - Settings (gear at the bottom of the sidebar): version + Check for updates.
 */

const RECHECK_MS = 4 * 60 * 60 * 1000;
let dismissedThisSession = false;
let modal = null;
let pollTimer = null;

const api = {
  status: (check) => fetch(`/api/update/status${check ? '?check=1' : ''}`).then(r => r.json()),
  download: () => fetch('/api/update/download', { method: 'POST' }).then(r => r.json()),
  restart: () => fetch('/api/update/restart', { method: 'POST' }),
  confirm: () => fetch('/api/update/confirm', { method: 'POST' }).catch(() => {}),
};

function fmtSize(bytes) {
  if (!bytes) return '';
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function closeModal() {
  clearInterval(pollTimer);
  pollTimer = null;
  modal?.remove();
  modal = null;
}

function openModal(title) {
  closeModal();
  modal = el('div', 'upd-backdrop');
  const box = el('div', 'upd-dialog');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const head = el('div', 'upd-head');
  head.appendChild(el('h3', 'upd-title', title));
  const x = el('button', 'upd-close', '×');
  x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', () => { dismissedThisSession = true; closeModal(); });
  head.appendChild(x);
  const body = el('div', 'upd-body');
  box.append(head, body);
  modal.appendChild(box);
  modal.addEventListener('click', (e) => { if (e.target === modal) { dismissedThisSession = true; closeModal(); } });
  document.body.appendChild(modal);
  return body;
}

/** Renders the update offer / progress into `body`. */
function renderUpdateSection(body, info, { showLater }) {
  const section = el('div', 'upd-section');
  body.appendChild(section);

  const render = (s) => {
    section.innerHTML = '';
    const latest = s.latest || {};
    const dl = s.download || {};

    if (!s.update_available) {
      section.appendChild(el('p', 'upd-ok', s.check_error ? s.check_error : '✓ You have the latest version.'));
      return;
    }

    const card = el('div', 'upd-card');
    card.appendChild(el('div', 'upd-card-title', `Version ${latest.version} is available${latest.size ? ` (${fmtSize(latest.size)})` : ''}`));
    if (latest.notes) card.appendChild(el('p', 'upd-notes', latest.notes));
    section.appendChild(card);

    const actions = el('div', 'upd-actions');
    section.appendChild(actions);

    if (s.needs_installer) {
      section.insertBefore(el('p', 'upd-warn', 'This update changes the voice engine, so it needs the full installer this one time.'), actions);
      const a = el('a', 'btn btn-primary btn-sm', 'Download installer');
      a.href = s.installer_url;
      a.target = '_blank';
      a.rel = 'noopener';
      actions.appendChild(a);
      return;
    }
    if (!s.can_self_update) {
      section.insertBefore(el('p', 'upd-warn', 'Updates install from the desktop app. (Running from source: use git pull.)'), actions);
      return;
    }

    if (dl.state === 'downloading' || dl.state === 'verifying') {
      const bar = el('div', 'upd-progress');
      const fill = el('div', 'upd-progress-fill');
      fill.style.width = `${Math.round((dl.progress || 0) * 100)}%`;
      bar.appendChild(fill);
      section.insertBefore(bar, actions);
      actions.appendChild(el('span', 'upd-muted', dl.state === 'verifying' ? 'Checking the download…' : `Downloading… ${Math.round((dl.progress || 0) * 100)}%`));
      return;
    }
    if (dl.state === 'ready') {
      actions.appendChild(el('span', 'upd-muted', 'Ready. The app restarts in a moment…'));
      const r = el('button', 'btn btn-primary btn-sm', 'Restart now');
      r.addEventListener('click', () => doRestart(section));
      actions.appendChild(r);
      return;
    }
    if (dl.state === 'error') {
      section.insertBefore(el('p', 'upd-error', dl.error || 'The update failed.'), actions);
    }
    if (showLater) {
      const later = el('button', 'btn btn-ghost btn-sm', 'Later');
      later.addEventListener('click', () => { dismissedThisSession = true; closeModal(); });
      actions.appendChild(later);
    }
    const go = el('button', 'btn btn-primary btn-sm', dl.state === 'error' ? 'Try again' : 'Update now');
    go.addEventListener('click', async () => {
      go.disabled = true;
      const res = await api.download();
      if (!res.ok) {
        render({ ...s, download: { state: 'error', error: res.error } });
        return;
      }
      poll();
    });
    actions.appendChild(go);
  };

  const poll = () => {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      const s = await api.status(false).catch(() => null);
      if (!s || !modal) return;
      render(s);
      if (s.download.state === 'ready') {
        clearInterval(pollTimer);
        setTimeout(() => doRestart(section), 1200);
      } else if (s.download.state === 'error') {
        clearInterval(pollTimer);
      }
    }, 500);
  };

  render(info);
  if (['downloading', 'verifying'].includes(info.download?.state)) poll();
}

async function doRestart(section) {
  section.innerHTML = '';
  section.appendChild(el('p', 'upd-muted', 'Restarting with the new version…'));
  await api.restart().catch(() => {});
}

function showUpdatePrompt(info) {
  const body = openModal('Update available');
  body.appendChild(el('p', 'upd-muted', `You have version ${info.current.version}.`));
  renderUpdateSection(body, info, { showLater: true });
}

export async function openSettings() {
  const body = openModal('Settings');
  const updates = el('div', 'upd-block');
  updates.appendChild(el('div', 'upd-label', 'Updates'));
  const versionLine = el('p', 'upd-version', 'Checking…');
  updates.appendChild(versionLine);
  const checkBtn = el('button', 'btn btn-secondary btn-sm', 'Check for updates');
  updates.appendChild(checkBtn);
  const result = el('div');
  updates.appendChild(result);
  body.appendChild(updates);

  const run = async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    try {
      const info = await api.status(true);
      versionLine.textContent = `Version ${info.current.version}`;
      result.innerHTML = '';
      renderUpdateSection(result, info, { showLater: false });
    } catch (e) {
      result.innerHTML = '';
      result.appendChild(el('p', 'upd-error', 'Could not check for updates.'));
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check for updates';
    }
  };
  checkBtn.addEventListener('click', run);
  run();
}

async function backgroundCheck() {
  if (dismissedThisSession || modal) return;
  try {
    const info = await api.status(true);
    if (info.update_available && !dismissedThisSession && !modal) showUpdatePrompt(info);
  } catch (e) { /* offline: try again later */ }
}

export function initUpdater() {
  document.getElementById('btn-open-settings')?.addEventListener('click', openSettings);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) { dismissedThisSession = true; closeModal(); } });
  // The UI loaded on this version: keep it (stops automatic rollback).
  setTimeout(() => api.confirm(), 2500);
  setTimeout(backgroundCheck, 4000);
  setInterval(backgroundCheck, RECHECK_MS);
}
