const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHttpHandler } = require('./http-handler');
const { createFakeGoogle } = require('./fake-google');

const port = Number(process.env.PORT || 4318);
const origin = `http://127.0.0.1:${port}`;
const google = createFakeGoogle();
const config = {
  ...process.env,
  SDDT_ADMIN_EMAIL: 'gamboaesai@gmail.com',
  SDDT_PUBLIC_ORIGIN: origin,
  SDDT_API_ORIGIN: origin,
  SDDT_ADMIN_SESSION_SECRET: 'test-session-secret',
};
const api = createHttpHandler({ google, config });
const root = path.resolve(__dirname, '..');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };

function staticFile(req, res) {
  const url = new URL(req.url, origin);
  let relative = decodeURIComponent(url.pathname);
  if (relative === '/') relative = '/index.html';
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.statusCode = 200; res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  if (path.extname(file) === '.html') {
    let html = fs.readFileSync(file, 'utf8');
    if (url.searchParams.get('mailOnly') !== '1') {
      html = html.replace(/data-booking-api="[^"]*"/, `data-booking-api="${origin}"`);
    }
    res.end(html); return true;
  }
  fs.createReadStream(file).pipe(res); return true;
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res);
  if (process.env.NODE_ENV === 'test' && req.url === '/__test/state') {
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ events: google.events, mails: google.mails }));
  }
  if (process.env.NODE_ENV === 'test' && req.url === '/__test/reset' && req.method === 'POST') {
    google.reset(); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true }));
  }
  if (!staticFile(req, res)) { res.statusCode = 404; res.end('Not found'); }
});

server.listen(port, '127.0.0.1', () => console.log(`SDDT dev server http://127.0.0.1:${port}`));
