const crypto = require('node:crypto');

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function encode(payload, secret) {
  if (!secret) throw new Error('SDDT_ADMIN_SESSION_SECRET is required.');
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

function decode(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = sign(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Number(payload.exp) <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return String(header).split(';').reduce((out, part) => {
    const index = part.indexOf('=');
    if (index < 0) return out;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return out;
  }, {});
}

function cookie(name, value, { maxAge = 60 * 60 * 12, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (httpOnly) parts.push('HttpOnly');
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

module.exports = { encode, decode, parseCookies, cookie };
