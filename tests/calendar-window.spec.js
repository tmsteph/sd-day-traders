const { test, expect } = require('@playwright/test');

function pacificDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function keyToUtc(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

test('date picker shows only useful dates in a rolling 30 day window', async ({ page }) => {
  await page.goto('/');

  const dates = page.locator('[data-calendar-grid] button.calendar-day');
  await expect(dates.first()).toBeVisible();
  const keys = await dates.evaluateAll(buttons => buttons.map(button => button.dataset.date));
  const todayKey = pacificDateKey();
  const todayUtc = keyToUtc(todayKey);

  expect(keys.length).toBeGreaterThan(0);
  expect(keys.length).toBeLessThanOrEqual(31);
  expect(keys.every(key => key >= todayKey)).toBeTruthy();
  expect(keys.every(key => (keyToUtc(key) - todayUtc) / 86400000 <= 30)).toBeTruthy();

  await expect(page.locator('.calendar-day-empty')).toHaveCount(0);
  await expect(page.locator('.calendar-spacer')).toHaveCount(0);
  await expect(page.locator('.calendar-weekdays')).toBeHidden();
  await expect(page.locator('[data-calendar-prev]')).toBeHidden();
  await expect(page.locator('[data-calendar-next]')).toBeHidden();

  const monthGroups = page.locator('.calendar-month-group');
  expect(await monthGroups.count()).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-calendar-month]')).toContainText('next 30 days');
});
