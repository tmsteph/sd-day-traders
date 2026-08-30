const { defineConfig } = require('@playwright/test');

const externalBaseUrl = process.env.BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: externalBaseUrl || 'http://127.0.0.1:4317',
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: externalBaseUrl ? undefined : {
    command: 'python3 -m http.server 4317 --bind 127.0.0.1',
    port: 4317,
    reuseExistingServer: false,
  },
});
