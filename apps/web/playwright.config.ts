import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  forbidOnly: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3015',
    viewport: { width: 1280, height: 900 },
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'only-on-failure',
    // Authenticated network traces retain cookies; screenshots and server logs suffice here.
    trace: 'off',
    video: 'off',
  },
});
