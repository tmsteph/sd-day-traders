const { test, expect } = require('@playwright/test');

const MAIL_ENDPOINT = 'https://portal.3dvr.tech/api/calendar/reminder-email';

test('mail-only production mode submits once without opening the visitor email app', async ({ page }) => {
  let captured = null;
  let capturedHeaders = null;

  await page.route(MAIL_ENDPOINT, async route => {
    captured = route.request().postDataJSON();
    capturedHeaders = route.request().headers();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, pending: true, warnings: [] }),
    });
  });

  await page.goto('/?mailOnly=1');
  const date = page.locator('[data-calendar-grid] button.calendar-day').first();
  await date.click();
  await page.getByLabel('Preferred time (your local time)').selectOption('10:30');
  await page.getByLabel('Consultation focus').selectOption({ label: 'Chart review' });
  await page.getByLabel('Name').fill('Magic Booking Test');
  await page.getByLabel('Email').fill('customer@example.com');

  await page.getByRole('button', { name: 'Request this time' }).click();

  await expect(page.locator('[data-booking-status]')).toContainText('you do not need to send anything');
  await expect(page.getByRole('button', { name: 'Request sent' })).toBeDisabled();
  expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(captured.mode).toBe('booking-request');
  expect(captured.name).toBe('Magic Booking Test');
  expect(captured.email).toBe('customer@example.com');
  expect(captured.topic).toBe('Chart review');
  expect(captured.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(captured.time).toBe('10:30');
  expect(capturedHeaders['idempotency-key']).toBeTruthy();
});

test('mail-only failure stays on the page and asks for retry instead of launching mailto', async ({ page }) => {
  await page.route(MAIL_ENDPOINT, route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'test failure' }),
  }));

  await page.goto('/?mailOnly=1');
  await page.locator('[data-calendar-grid] button.calendar-day').first().click();
  await page.getByLabel('Preferred time (your local time)').selectOption('10:30');
  await page.getByLabel('Consultation focus').selectOption({ label: 'Chart review' });
  await page.getByLabel('Name').fill('Retry Test');
  await page.getByLabel('Email').fill('customer@example.com');
  await page.getByRole('button', { name: 'Request this time' }).click();

  await expect(page.locator('[data-booking-status]')).toContainText("couldn't send automatically");
  await expect(page.getByRole('button', { name: 'Request this time' })).toBeEnabled();
  expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:/);
});
