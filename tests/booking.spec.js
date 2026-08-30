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
  await page.getByLabel('Preferred time (your local time)').selectOption('10:30');
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

test('New York visitor sees local time with Pacific equivalent', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const page = await context.newPage();
  await page.goto('/');

  await expect(page.locator('[data-timezone-note]')).toContainText('America/New_York');
  await page.locator('[data-calendar-grid] button.calendar-day').nth(1).click();

  const option = page.locator('#booking-time option[value="10:30"]');
  await expect(option).toHaveText(/1:30 PM local · 10:30 AM PT/);

  await page.getByLabel('Preferred time (your local time)').selectOption('10:30');
  await expect(page.locator('[data-booking-summary]')).toContainText('1:30 PM');
  await expect(page.locator('[data-booking-summary]')).toContainText('10:30 AM');
  await expect(page.locator('[data-booking-summary]')).toContainText('America/New_York');

  await context.close();
});

test('Tokyo visitor is warned when a Pacific slot lands on the next local day', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('[data-calendar-grid] button.calendar-day').nth(1).click();

  const optionText = await page.locator('#booking-time option[value="18:00"]').textContent();
  expect(optionText).toContain('local · 6:00 PM PT');
  expect(optionText).toMatch(/(10:00|11:00) AM/);
  expect(optionText).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);

  await context.close();
});

test('mobile page has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBeFalsy();
});
