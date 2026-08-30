const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const session = require('../server/session');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4318';
const ADMIN_EMAIL = 'gamboaesai@gmail.com';
const SESSION_SECRET = 'test-session-secret';

function pacificDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function reset(request) {
  await request.post('/__test/reset');
}

async function state(request) {
  return (await (await request.get('/__test/state')).json());
}

async function loginAdmin(context) {
  const token = session.encode({ email: ADMIN_EMAIL, exp: Date.now() + 3600000 }, SESSION_SECRET);
  await context.addCookies([{ name: 'sddt_admin', value: token, url: BASE }]);
}

async function nextBookableDate(page) {
  await page.goto('/');
  const dates = page.locator('[data-calendar-grid] button.calendar-day');
  const button = dates.nth(1);
  const key = await button.getAttribute('data-date');
  await button.click();
  await expect(page.locator('#booking-time option[value="09:00"]')).toBeEnabled();
  return key;
}

async function submitRequest(page) {
  const dateKey = await nextBookableDate(page);
  await page.getByLabel('Preferred time (your local time)').selectOption('09:00');
  await page.getByLabel('Consultation focus').selectOption({ label: 'Chart review' });
  await page.getByLabel('Name').fill('Release Test');
  await page.getByLabel('Email').fill('release-test@example.com');
  await page.getByRole('button', { name: 'Request this time' }).click();
  await expect(page.locator('[data-booking-status]')).toContainText('Request received');
  return dateKey;
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('calendar exposes only today and future dates', async ({ page }) => {
  await page.goto('/');
  const keys = await page.locator('[data-calendar-grid] button.calendar-day').evaluateAll(
    buttons => buttons.map(button => button.dataset.date)
  );
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.every(key => key >= pacificDateKey())).toBeTruthy();
  await expect(page.locator('[data-calendar-prev]')).toBeDisabled();
});

test('public booking creates a pending hold, sends notifications, and never claims confirmation', async ({ page, request }) => {
  await submitRequest(page);
  const snapshot = await state(request);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.events[0].extendedProperties.private.sddtStatus).toBe('pending');
  expect(snapshot.events[0].transparency).toBe('opaque');
  expect(snapshot.mails).toHaveLength(2);
  expect(snapshot.mails.find(mail => mail.to === ADMIN_EMAIL).text).toContain('Review & approve:');
  expect(snapshot.mails.find(mail => mail.to === 'release-test@example.com').text).toContain('not confirmed yet');
  expect(await page.locator('[data-booking-status]').innerText()).not.toMatch(/^confirmed/i);
  const script = fs.readFileSync('script.js', 'utf8');
  expect(script).toContain('bookingApiEnabled');
  expect(script).toContain('mailto:${bookingRecipient}');
  expect(script).not.toContain('bookingRelayUrl');
});

test('email deep link does not expose or mutate a request until Esai authenticates and approves', async ({ page, request, context }) => {
  await submitRequest(page);
  let snapshot = await state(request);
  const id = snapshot.events[0].id;

  await page.goto(`/admin/?request=${encodeURIComponent(id)}&action=approve`);
  await expect(page.getByRole('link', { name: 'Connect Google' })).toBeVisible();
  await expect(page.locator('[data-admin-content]')).toBeHidden();
  snapshot = await state(request);
  expect(snapshot.events[0].extendedProperties.private.sddtStatus).toBe('pending');

  await loginAdmin(context);
  await page.reload();
  await expect(page.locator(`[data-request-id="${id}"]`)).toBeVisible();
  await page.locator(`[data-request-id="${id}"]`).getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('[data-admin-status]')).toContainText('confirmed');

  snapshot = await state(request);
  expect(snapshot.events[0].extendedProperties.private.sddtStatus).toBe('confirmed');
  expect(snapshot.events[0].attendees).toEqual([{ email: 'release-test@example.com' }]);
  expect(snapshot.mails.some(mail => mail.subject.includes('confirmed'))).toBeTruthy();
});

test('reschedule deep link opens an editable email and releases the held slot after send', async ({ page, request, context }) => {
  await submitRequest(page);
  const id = (await state(request)).events[0].id;
  await loginAdmin(context);
  await page.goto(`/admin/?request=${encodeURIComponent(id)}&action=reschedule`);
  const card = page.locator(`[data-request-id="${id}"]`);
  const editor = card.locator('.reschedule-editor textarea');
  await expect(editor).toBeVisible();
  await editor.fill('Could you do another afternoon?');
  await card.getByRole('button', { name: 'Send reschedule email' }).click();
  await expect(page.locator('[data-admin-status]')).toContainText('Customer notified');
  const snapshot = await state(request);
  expect(snapshot.events[0].extendedProperties.private.sddtStatus).toBe('reschedule_requested');
  expect(snapshot.events[0].transparency).toBe('transparent');
  expect(snapshot.mails.at(-1).text).toBe('Could you do another afternoon?');
});

test('Esai blackout block disables that public booking slot', async ({ page, context }) => {
  const dateKey = await nextBookableDate(page);
  await loginAdmin(context);
  await page.goto('/admin/');
  await page.locator('[data-block-form] input[name="start"]').fill(`${dateKey}T10:30`);
  await page.locator('[data-block-form] input[name="end"]').fill(`${dateKey}T11:30`);
  await page.locator('[data-block-form] input[name="title"]').fill('Unavailable');
  await page.getByRole('button', { name: 'Block this time' }).click();
  await expect(page.locator('[data-admin-status]')).toContainText('Unavailable time added');

  await page.goto('/');
  await page.locator(`[data-calendar-grid] button[data-date="${dateKey}"]`).click();
  await expect(page.locator('#booking-time option[value="10:30"]')).toBeDisabled();
  await expect(page.locator('#booking-time option[value="09:00"]')).toBeEnabled();
});

test('mobile public and admin pages have no horizontal overflow', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBeFalsy();
  await loginAdmin(context);
  await page.goto('/admin/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBeFalsy();
});

test.describe('timezone display', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('shows local time with Pacific equivalent', async ({ page }) => {
    await nextBookableDate(page);
    const label = await page.locator('#booking-time option[value="10:30"]').innerText();
    expect(label).toMatch(/local · .*PT/);
    expect(label).not.toBe('10:30 AM PT');
  });
});
