/**
 * Centralized API Client for Book Narrator backend endpoints.
 */

export async function fetchDraft() {
  const res = await fetch('/api/draft');
  return res.ok ? res.json() : {};
}

export async function saveDraftApi(payload) {
  return fetch('/api/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function uploadImageApi(dataUrl) {
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data_url: dataUrl })
  });
  return res.ok ? res.json() : null;
}

export async function fetchStatusApi() {
  const res = await fetch('/api/status');
  return res.ok ? res.json() : {};
}

export async function fetchVoicesApi() {
  const res = await fetch('/api/voices');
  return res.ok ? res.json() : {};
}

export async function fetchSessionsApi() {
  const res = await fetch('/api/sessions');
  return res.ok ? res.json() : [];
}

export async function deleteSessionApi(sessionId) {
  return fetch('/api/sessions/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
}

export async function updateSessionApi(sessionId, fields) {
  return fetch('/api/sessions/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, ...fields })
  });
}

export async function previewVoiceApi(payload) {
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}
