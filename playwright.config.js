const { defineConfig } = require('@playwright/test');

const externalBaseUrl = process.env.BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'booking.spec.js',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: externalBaseUrl || 'http://127.0.0.1:4318',
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: externalBaseUrl ? undefined : {
    command: 'NODE_ENV=test PORT=4318 node server/dev-server.js',
    port: 4318,
    reuseExistingServer: false,
  },
});
