const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Esai admin points at the production booking API', () => {
  const html = fs.readFileSync('admin/index.html', 'utf8');
  assert.match(html, /data-booking-api="https:\/\/bookings\.3dvr\.tech"/);
});

test('booking API is private behind the HTTPS reverse proxy', () => {
  const start = fs.readFileSync('server/start.js', 'utf8');
  const env = fs.readFileSync('server/env.example', 'utf8');
  const service = fs.readFileSync('deploy/sddt-booking.service', 'utf8');
  const caddy = fs.readFileSync('deploy/Caddyfile', 'utf8');
  assert.match(start, /HOST \|\| '127\.0\.0\.1'/);
  assert.match(env, /PORT=8791/);
  assert.match(service, /User=sddt/);
  assert.match(service, /ProtectSystem=strict/);
  assert.match(service, /MemoryMax=128M/);
  assert.match(caddy, /bookings\.3dvr\.tech/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:8791/);
});
