const { load, save } = require('./vault');

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const IDENTITY_SCOPES = ['openid', 'email', 'profile'];

function jsonHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function jsonResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || fallback || `Google API error ${response.status}`);
  return data;
}

function createGoogleAdapter({ fetchImpl = fetch, config = process.env, credentialStore } = {}) {
  const store = credentialStore || { load: () => load(config), save: value => save(value, config) };

  async function getCredential() {
    const credential = await store.load();
    if (!credential?.refreshToken && !credential?.accessToken) throw new Error('Esai Google account is not connected.');
    if (credential.accessToken && (!credential.expiresAt || credential.expiresAt > Date.now() + 300000)) return credential;
    const body = new URLSearchParams({
      client_id: config.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET || '',
      refresh_token: credential.refreshToken || '',
      grant_type: 'refresh_token',
    });
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const data = await jsonResponse(response, 'Unable to refresh Google OAuth token.');
    const updated = {
      ...credential,
      accessToken: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000),
      scope: data.scope || credential.scope,
    };
    await store.save(updated);
    return updated;
  }

  async function api(url, options = {}) {
    const credential = await getCredential();
    const response = await fetchImpl(url, {
      ...options,
      headers: { ...jsonHeaders(credential.accessToken), ...(options.headers || {}) },
    });
    return jsonResponse(response);
  }

  return {
    scopes: [...IDENTITY_SCOPES, CALENDAR_SCOPE, GMAIL_SEND_SCOPE],
    isConnected: async () => Boolean(await store.load()),
    async authorizationUrl({ state, verifier, redirectUri }) {
      const params = new URLSearchParams({
        client_id: config.GOOGLE_OAUTH_CLIENT_ID || '',
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        code_challenge: require('node:crypto').createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        state,
        scope: this.scopes.join(' '),
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    },
    async exchangeCode({ code, verifier, redirectUri }) {
      const response = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.GOOGLE_OAUTH_CLIENT_ID || '',
          client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET || '',
          code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code',
        }),
      });
      const data = await jsonResponse(response, 'Unable to exchange Google OAuth code.');
      const credential = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
        scope: data.scope || this.scopes.join(' '),
      };
      if (!credential.refreshToken) throw new Error('Google did not return a refresh token. Reconnect with consent.');
      const identityResponse = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${credential.accessToken}` },
      });
      const identity = await jsonResponse(identityResponse, 'Unable to verify Google identity.');
      credential.email = String(identity.email || '').toLowerCase();
      return credential;
    },
    async saveCredential(credential) { await store.save(credential); },
    async listEvents(timeMin, timeMax) {
      const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax, maxResults: '250' });
      const data = await api(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
      return data.items || [];
    },
    async createEvent(event) {
      return api('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST', body: JSON.stringify(event),
      });
    },
    async patchEvent(eventId, patch, { sendUpdates = 'none' } = {}) {
      return api(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
    },
    async sendMail({ to, subject, text }) {
      const raw = [
        `To: ${String(to).replace(/[\r\n]/g, '')}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '', text,
      ].join('\r\n');
      return api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
      });
    },
  };
}

module.exports = { createGoogleAdapter, CALENDAR_SCOPE, GMAIL_SEND_SCOPE };
