const { defineConfig, devices } = require('@playwright/test');

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The repository's default Playwright root is the Electron UI suite
 * (playwright.config.cjs -> tests/ui). The PWA suite needs its own origin and
 * a static server for dist-pwa, so it lives in a dedicated config.
 */
module.exports = defineConfig({
  testDir: './tests/pwa',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/serve-pwa.cjs ${PORT}`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  projects: [{ name: 'pwa', use: { ...devices['Desktop Chrome'] } }],
});
