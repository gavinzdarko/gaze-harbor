import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' },
  webServer: { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
