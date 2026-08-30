const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeGoogle } = require('../../server/fake-google');
const { createBookingService } = require('../../server/booking-service');

const NOW = new Date('2026-08-29T15:00:00.000Z'); // 8:00 AM PDT
const adminEmail = 'gamboaesai@gmail.com';

function setup() {
  const google = createFakeGoogle();
  const service = createBookingService({
    google,
    adminEmail,
    publicOrigin: 'https://sd-day-traders.3dvr.tech',
    now: () => new Date(NOW),
  });
  return { google, service };
}

function request(service, start = '2026-08-29T16:00:00.000Z', overrides = {}) {
  return service.request({
    start,
    timeZone: 'America/New_York',
    topic: 'Chart review',
    name: 'Release Test',
    email: 'release-test@example.com',
    ...overrides,
  });
}

test('new request becomes a pending calendar hold and sends two non-confirmation emails', async () => {
  const { google, service } = setup();
  const result = await request(service);
  assert.equal(result.status, 'pending');
  assert.equal(google.events.length, 1);
  assert.equal(google.events[0].extendedProperties.private.sddtStatus, 'pending');
  assert.equal(google.events[0].transparency, 'opaque');
  assert.equal(google.mails.length, 2);
  const organizer = google.mails.find(mail => mail.to === adminEmail);
  assert.match(organizer.text, /Review & approve:/);
  assert.match(organizer.text, /Ask to reschedule:/);
  assert.match(organizer.text, /Decline:/);
  assert.match(organizer.text, /Opening a link does not change/);
  const customer = google.mails.find(mail => mail.to === 'release-test@example.com');
  assert.match(customer.text, /not confirmed yet/i);
});

test('approval re-check prevents a double booking', async () => {
  const { google, service } = setup();
  const pending = await request(service);
  await google.createEvent({
    summary: 'Conflict',
    start: { dateTime: '2026-08-29T16:15:00.000Z' },
    end: { dateTime: '2026-08-29T16:45:00.000Z' },
    transparency: 'opaque',
  });
  await assert.rejects(() => service.approve(pending.requestId), error => error.status === 409);
  assert.equal(google.events[0].extendedProperties.private.sddtStatus, 'pending');
});

test('approval is idempotent and adds attendee exactly once', async () => {
  const { google, service } = setup();
  const pending = await request(service, '2026-08-29T17:30:00.000Z');
  const first = await service.approve(pending.requestId);
  assert.equal(first.status, 'confirmed');
  assert.deepEqual(google.events[0].attendees, [{ email: 'release-test@example.com' }]);
  assert.equal(google.mails.length, 3);
  await service.approve(pending.requestId);
  assert.equal(google.events.length, 1);
  assert.equal(google.mails.length, 3);
});

test('reschedule releases the slot and sends only one editable-message path', async () => {
  const { google, service } = setup();
  const pending = await request(service);
  await service.reschedule(pending.requestId, 'Please choose another afternoon.');
  assert.equal(google.events[0].extendedProperties.private.sddtStatus, 'reschedule_requested');
  assert.equal(google.events[0].transparency, 'transparent');
  assert.equal(google.mails.at(-1).text, 'Please choose another afternoon.');
  const mailCount = google.mails.length;
  await service.reschedule(pending.requestId, 'duplicate');
  assert.equal(google.mails.length, mailCount);
});

test('blackout blocks affect availability and can be removed', async () => {
  const { service } = setup();
  const block = await service.createBlock({
    start: '2026-08-29T17:30:00.000Z',
    end: '2026-08-29T18:30:00.000Z',
    title: 'Personal',
  });
  let busy = await service.availability('2026-08-29T15:00:00.000Z', '2026-08-29T22:00:00.000Z');
  assert.equal(busy.length, 1);
  await service.removeBlock(block.id);
  busy = await service.availability('2026-08-29T15:00:00.000Z', '2026-08-29T22:00:00.000Z');
  assert.equal(busy.length, 0);
});
