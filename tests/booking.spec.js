const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

function pacificDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

test('calendar exposes only today and future dates', async ({ page }) => {
  await page.goto('/');
  const keys = await page.locator('[data-calendar-grid] button.calendar-day').evaluateAll(
    buttons => buttons.map(button => button.dataset.date)
  );
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.every(key => key >= pacificDateKey())).toBeTruthy();
  await expect(page.locator('[data-calendar-prev]')).toBeDisabled();
  await expect(page.locator('[data-calendar-grid] [data-outside-month="true"]').first()).toBeVisible();
});

test('booking uses the explicit mailto flow and never calls the relay', async ({ page }) => {
  const relayRequests = [];
  page.on('request', request => {
    if (request.url().includes('portal.3dvr.tech/api/calendar')) relayRequests.push(request.url());
  });

  await page.goto('/');
  const futureDate = page.locator('[data-calendar-grid] button.calendar-day').nth(1);
  await futureDate.click();
  await page.getByLabel('Preferred time (Pacific Time)').selectOption({ label: '10:30 AM' });
  await page.getByLabel('Consultation focus').selectOption({ label: 'Chart review' });
  await page.getByLabel('Name').fill('Release Test');
  await page.getByLabel('Email').fill('release-test@example.com');
  await page.getByRole('button', { name: 'Request this time' }).click();

  await expect(page.locator('[data-booking-status]')).toContainText('tap Send to deliver it to Esai');
  expect(relayRequests).toEqual([]);

  const script = fs.readFileSync('script.js', 'utf8');
  expect(script).toContain('mailto:${bookingRecipient}');
  expect(script).toContain('gamboaesai@gmail.com');
  expect(script).not.toContain('bookingRelayUrl');
});

test('mobile page has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBeFalsy();
});
