const apiBase = (document.documentElement.dataset.bookingApi || '').replace(/\/$/, '');
const apiUrl = path => `${apiBase}${path}`;
const connectionTitle = document.querySelector('[data-connection-title]');
const connectionDetail = document.querySelector('[data-connection-detail]');
const connectGoogle = document.querySelector('[data-connect-google]');
const logoutButton = document.querySelector('[data-logout]');
const adminContent = document.querySelector('[data-admin-content]');
const requestList = document.querySelector('[data-request-list]');
const blockList = document.querySelector('[data-block-list]');
const blockForm = document.querySelector('[data-block-form]');
const refreshButton = document.querySelector('[data-refresh]');
const adminStatus = document.querySelector('[data-admin-status]');
const PACIFIC = 'America/Los_Angeles';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number.isNaN(Number(value)) ? value : Number(value)]));
}

function makePacificInstant(localValue) {
  const match = String(localValue || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, h, min);
  const zoned = getZonedParts(new Date(utcGuess), PACIFIC);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
  return new Date(utcGuess - (zonedAsUtc - utcGuess));
}

function formatPacific(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(iso));
}

function requestCard(request, target) {
  const card = document.createElement('article');
  card.className = 'request-card';
  card.dataset.requestId = request.id;
  card.dataset.highlight = String(target.request === request.id);
  card.innerHTML = `
    <span class="status-pill">${escapeHtml(request.status)}</span>
    <h3>${escapeHtml(request.customerName)} · ${escapeHtml(request.topic)}</h3>
    <p>${escapeHtml(request.customerTime)}</p>
    <p class="request-meta">${escapeHtml(request.pacificTime)} · ${escapeHtml(request.customerEmail)}</p>
    <div class="request-actions"></div>
  `;
  const actions = card.querySelector('.request-actions');
  if (request.status === 'pending') {
    const approve = document.createElement('button');
    approve.className = 'button button-primary'; approve.type = 'button'; approve.textContent = 'Approve';
    approve.addEventListener('click', () => act(request.id, 'approve', {}));
    const reschedule = document.createElement('button');
    reschedule.className = 'button button-secondary'; reschedule.type = 'button'; reschedule.textContent = 'Ask to reschedule';
    reschedule.addEventListener('click', () => openReschedule(card, request));
    const decline = document.createElement('button');
    decline.className = 'button button-secondary'; decline.type = 'button'; decline.textContent = 'Decline';
    decline.addEventListener('click', async () => {
      if (confirm(`Decline ${request.customerName}'s request?`)) await act(request.id, 'decline', {});
    });
    actions.append(approve, reschedule, decline);
  }
  if (target.request === request.id && target.action === 'reschedule') {
    queueMicrotask(() => openReschedule(card, request));
  }
  return card;
}

function openReschedule(card, request) {
  if (card.querySelector('.reschedule-editor')) return;
  const editor = document.createElement('div');
  editor.className = 'reschedule-editor';
  const textarea = document.createElement('textarea');
  textarea.value = `Hi ${request.customerName},\n\nEsai needs to find another time for your consultation originally requested for ${request.customerTime}. Please reply with another time that works for you.\n\nThanks.`;
  const send = document.createElement('button');
  send.className = 'button button-primary'; send.type = 'button'; send.textContent = 'Send reschedule email';
  send.addEventListener('click', () => act(request.id, 'reschedule', { message: textarea.value }));
  editor.append(textarea, send);
  card.append(editor);
  textarea.focus();
}

async function act(id, action, body) {
  adminStatus.textContent = `${action[0].toUpperCase()}${action.slice(1)} in progress…`;
  try {
    await api(`/api/admin/requests/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(body) });
    adminStatus.textContent = action === 'approve' ? 'Appointment confirmed and customer notified.' : 'Customer notified.';
    await loadDashboard();
  } catch (error) {
    adminStatus.textContent = error.message;
  }
}

function renderRequests(requests) {
  const params = new URLSearchParams(location.search);
  const target = { request: params.get('request') || '', action: params.get('action') || '' };
  requestList.replaceChildren();
  if (!requests.length) {
    requestList.textContent = 'No consultation requests yet.';
    return;
  }
  requests.forEach(request => requestList.append(requestCard(request, target)));
  const focused = target.request && requestList.querySelector(`[data-request-id="${CSS.escape(target.request)}"]`);
  focused?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function renderBlocks(blocks) {
  blockList.replaceChildren();
  if (!blocks.length) { blockList.textContent = 'No SD Day Traders blackout blocks.'; return; }
  blocks.forEach(block => {
    const row = document.createElement('div'); row.className = 'block-row';
    const text = document.createElement('div');
    text.innerHTML = `<strong>${escapeHtml(block.title)}</strong><div class="request-meta">${escapeHtml(formatPacific(block.start))} → ${escapeHtml(formatPacific(block.end))}</div>`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button button-secondary'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      try { await api(`/api/admin/blocks/${encodeURIComponent(block.id)}`, { method: 'DELETE' }); await loadDashboard(); }
      catch (error) { adminStatus.textContent = error.message; }
    });
    row.append(text, remove); blockList.append(row);
  });
}

async function loadDashboard() {
  const [requests, blocks] = await Promise.all([api('/api/admin/requests'), api('/api/admin/blocks')]);
  renderRequests(requests.requests || []); renderBlocks(blocks.blocks || []);
}

async function initialize() {
  if (!apiBase) {
    connectionTitle.textContent = 'Admin backend not enabled in this build';
    connectionDetail.textContent = 'The admin UI is present, but it stays disabled until the tested booking API is connected.';
    connectGoogle.hidden = true;
    logoutButton.hidden = true;
    adminContent.hidden = true;
    return;
  }
  const returnTo = `${location.pathname}${location.search}`;
  connectGoogle.href = apiUrl(`/api/admin/google/start?returnTo=${encodeURIComponent(returnTo)}`);
  try {
    const status = await api('/api/admin/status');
    if (!status.authenticated || !status.connected) {
      connectionTitle.textContent = status.authenticated ? 'Google needs reconnecting' : 'Connect Esai’s Google account';
      connectionDetail.textContent = 'Calendar event access + Gmail send-only. No mailbox read permission.';
      connectGoogle.hidden = false; adminContent.hidden = true; logoutButton.hidden = true;
      return;
    }
    connectionTitle.textContent = `Connected as ${status.email}`;
    connectionDetail.textContent = 'Calendar write + Gmail send-only are available.';
    connectGoogle.hidden = true; logoutButton.hidden = false; adminContent.hidden = false;
    await loadDashboard();
  } catch (error) {
    connectionTitle.textContent = 'Admin unavailable'; connectionDetail.textContent = error.message;
    adminContent.hidden = true;
  }
}

blockForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(blockForm);
  const start = makePacificInstant(data.get('start')); const end = makePacificInstant(data.get('end'));
  if (!start || !end || end <= start) { adminStatus.textContent = 'Choose a valid Pacific Time range.'; return; }
  try {
    await api('/api/admin/blocks', { method: 'POST', body: JSON.stringify({ start: start.toISOString(), end: end.toISOString(), title: data.get('title') }) });
    blockForm.reset(); adminStatus.textContent = 'Unavailable time added to Google Calendar.'; await loadDashboard();
  } catch (error) { adminStatus.textContent = error.message; }
});
refreshButton.addEventListener('click', () => loadDashboard().catch(error => { adminStatus.textContent = error.message; }));
logoutButton.addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); });
initialize();
