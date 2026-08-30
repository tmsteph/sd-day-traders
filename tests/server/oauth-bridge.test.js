const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHttpHandler } = require('../../server/http-handler');

const PORTAL_REDIRECT = 'https://portal.3dvr.tech/api/oauth/google';

async function withServer(run) {
  const calls = { authorization: [], exchange: [], saved: [] };
  const google = {
    isConnected: async () => false,
    authorizationUrl: async input => {
      calls.authorization.push(input);
      const url = new URL('https://accounts.google.test/auth');
      url.searchParams.set('state', input.state);
      url.searchParams.set('redirect_uri', input.redirectUri);
      return url.toString();
    },
    exchangeCode: async input => {
      calls.exchange.push(input);
      return { email: 'gamboaesai@gmail.com', refreshToken: 'refresh', accessToken: 'access' };
    },
    saveCredential: async value => calls.saved.push(value),
  };
  const config = {
    SDDT_ADMIN_EMAIL: 'gamboaesai@gmail.com',
    SDDT_PUBLIC_ORIGIN: 'https://sd-day-traders.3dvr.tech',
    SDDT_API_ORIGIN: 'https://bookings.3dvr.tech',
    SDDT_GOOGLE_REDIRECT_URI: PORTAL_REDIRECT,
    SDDT_ADMIN_SESSION_SECRET: 'unit-test-session-secret',
  };
  const server = http.createServer(createHttpHandler({ config, google }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base, calls }); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('Google connect uses the authorized Portal callback with prefixed signed state', async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(`${base}/api/admin/google/start?returnTo=%2Fadmin%2F`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(calls.authorization.length, 1);
    assert.equal(calls.authorization[0].redirectUri, PORTAL_REDIRECT);
    assert.match(calls.authorization[0].state, /^sddt\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.match(response.headers.get('set-cookie') || '', /sddt_oauth=sddt\./);
  });
});

test('booking callback still requires its cookie and exchanges with the Portal redirect URI', async () => {
  await withServer(async ({ base, calls }) => {
    const start = await fetch(`${base}/api/admin/google/start?returnTo=%2Fadmin%2F`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = (start.headers.get('set-cookie') || '').split(';')[0];

    const missingCookie = await fetch(`${base}/api/admin/google/callback?code=test-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    assert.equal(missingCookie.status, 400);
    assert.equal(calls.exchange.length, 0);

    const callback = await fetch(`${base}/api/admin/google/callback?code=test-code&state=${encodeURIComponent(state)}`, {
      redirect: 'manual', headers: { Cookie: cookie },
    });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), 'https://sd-day-traders.3dvr.tech/admin/');
    assert.equal(calls.exchange.length, 1);
    assert.equal(calls.exchange[0].redirectUri, PORTAL_REDIRECT);
    assert.equal(calls.exchange[0].code, 'test-code');
    assert.equal(calls.saved.length, 1);
  });
});
