const crypto = require('node:crypto');
const { createGoogleAdapter } = require('./google');
const { createBookingService } = require('./booking-service');
const session = require('./session');

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 32768) { reject(Object.assign(new Error('Request too large.'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function appendCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', current ? [].concat(current, value) : value);
}

function redirect(res, location, status = 302) {
  res.statusCode = status; res.setHeader('Location', location); res.end();
}

function safeReturnTo(value) {
  const path = String(value || '/admin/');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/admin/';
}

function createHttpHandler(options = {}) {
  const config = options.config || process.env;
  const adminEmail = String(config.SDDT_ADMIN_EMAIL || 'gamboaesai@gmail.com').toLowerCase();
  const publicOrigin = String(config.SDDT_PUBLIC_ORIGIN || 'https://sd-day-traders.3dvr.tech').replace(/\/$/, '');
  const apiOrigin = String(config.SDDT_API_ORIGIN || 'http://127.0.0.1:4318').replace(/\/$/, '');
  const sessionSecret = config.SDDT_ADMIN_SESSION_SECRET || '';
  const googleRedirectUri = String(config.SDDT_GOOGLE_REDIRECT_URI || `${apiOrigin}/api/admin/google/callback`);
  const google = options.google || createGoogleAdapter({ config });
  const booking = options.booking || createBookingService({ google, adminEmail, publicOrigin, now: options.now });

  function cors(req, res) {
    const origin = String(req.headers.origin || '');
    if (origin && origin === publicOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }

  function adminSession(req) {
    const token = session.parseCookies(req.headers.cookie || '').sddt_admin;
    const payload = session.decode(token, sessionSecret);
    return payload?.email === adminEmail ? payload : null;
  }

  function requireAdmin(req) {
    const auth = adminSession(req);
    if (!auth) throw Object.assign(new Error('Admin authentication required.'), { status: 401 });
    return auth;
  }

  async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const url = new URL(req.url, apiOrigin);
    const path = url.pathname;
    try {
      if (req.method === 'GET' && path === '/api/health') {
        return sendJson(res, 200, { ok: true, service: 'sd-day-traders-booking' });
      }
      if (req.method === 'GET' && path === '/api/availability') {
        if (!(await google.isConnected())) throw Object.assign(new Error('Live availability is not connected yet.'), { status: 503 });
        return sendJson(res, 200, { busy: await booking.availability(url.searchParams.get('from'), url.searchParams.get('to')) });
      }
      if (req.method === 'POST' && path === '/api/bookings/request') {
        if (!(await google.isConnected())) throw Object.assign(new Error('Booking is temporarily unavailable.'), { status: 503 });
        const result = await booking.request(await readJson(req));
        return sendJson(res, result.warnings?.length ? 202 : 201, result);
      }
      if (req.method === 'GET' && path === '/api/admin/status') {
        const auth = adminSession(req);
        const connected = auth ? await google.isConnected() : false;
        return sendJson(res, 200, { authenticated: Boolean(auth), connected, email: auth?.email || null });
      }
      if (req.method === 'GET' && path === '/api/admin/google/start') {
        if (!sessionSecret) throw Object.assign(new Error('Admin session is not configured.'), { status: 503 });
        const verifier = crypto.randomBytes(32).toString('base64url');
        const payload = {
          verifier,
          returnTo: safeReturnTo(url.searchParams.get('returnTo')),
          nonce: crypto.randomBytes(16).toString('base64url'),
          exp: Date.now() + 15 * 60000,
        };
        const stateToken = session.encode(payload, sessionSecret);
        const state = `sddt.${stateToken}`;
        appendCookie(res, session.cookie('sddt_oauth', state, { maxAge: 900 }));
        const location = await google.authorizationUrl({ state, verifier, redirectUri: googleRedirectUri });
        return redirect(res, location);
      }
      if (req.method === 'GET' && path === '/api/admin/google/callback') {
        const state = url.searchParams.get('state') || '';
        const cookieState = session.parseCookies(req.headers.cookie || '').sddt_oauth || '';
        const stateToken = state.startsWith('sddt.') ? state.slice(5) : state;
        const flow = state && cookieState === state ? session.decode(stateToken, sessionSecret) : null;
        if (!flow) throw Object.assign(new Error('OAuth state check failed.'), { status: 400 });
        if (url.searchParams.get('error')) throw Object.assign(new Error(`Google authorization failed: ${url.searchParams.get('error')}`), { status: 400 });
        const credential = await google.exchangeCode({
          code: url.searchParams.get('code') || '',
          verifier: flow.verifier,
          redirectUri: googleRedirectUri,
        });
        if (String(credential.email || '').toLowerCase() !== adminEmail) {
          throw Object.assign(new Error('This Google account is not authorized for SD Day Traders admin.'), { status: 403 });
        }
        await google.saveCredential(credential);
        const adminToken = session.encode({ email: adminEmail, exp: Date.now() + 12 * 60 * 60 * 1000 }, sessionSecret);
        appendCookie(res, session.cookie('sddt_admin', adminToken));
        appendCookie(res, session.cookie('sddt_oauth', '', { maxAge: 0 }));
        return redirect(res, `${publicOrigin}${safeReturnTo(flow.returnTo)}`);
      }
      if (req.method === 'POST' && path === '/api/admin/logout') {
        requireAdmin(req);
        appendCookie(res, session.cookie('sddt_admin', '', { maxAge: 0 }));
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'GET' && path === '/api/admin/requests') {
        requireAdmin(req); return sendJson(res, 200, { requests: await booking.listRequests() });
      }
      if (req.method === 'GET' && path === '/api/admin/blocks') {
        requireAdmin(req); return sendJson(res, 200, { blocks: await booking.listBlocks() });
      }
      if (req.method === 'POST' && path === '/api/admin/blocks') {
        requireAdmin(req); return sendJson(res, 201, { block: await booking.createBlock(await readJson(req)) });
      }
      const blockMatch = path.match(/^\/api\/admin\/blocks\/([^/]+)$/);
      if (req.method === 'DELETE' && blockMatch) {
        requireAdmin(req); return sendJson(res, 200, await booking.removeBlock(decodeURIComponent(blockMatch[1])));
      }
      const actionMatch = path.match(/^\/api\/admin\/requests\/([^/]+)\/(approve|reschedule|decline)$/);
      if (req.method === 'POST' && actionMatch) {
        requireAdmin(req);
        const [, rawId, action] = actionMatch;
        const id = decodeURIComponent(rawId); const body = await readJson(req);
        const result = action === 'approve'
          ? await booking.approve(id)
          : action === 'reschedule'
            ? await booking.reschedule(id, body.message)
            : await booking.decline(id, body.message);
        return sendJson(res, 200, { request: result });
      }
      return sendJson(res, 404, { error: 'Not found.' });
    } catch (error) {
      const status = Number(error.status) || 500;
      if (status >= 500) console.error('[sddt-booking]', error);
      return sendJson(res, status, { error: error.message || 'Unexpected server error.' });
    }
  }

  return handler;
}

module.exports = { createHttpHandler, readJson, safeReturnTo };
