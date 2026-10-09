import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

const localChromium = !process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  webServer: {
    command: 'node tests/helpers/static-server.js',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    launchOptions: {
      ...(localChromium ? { executablePath: localChromium } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
});
