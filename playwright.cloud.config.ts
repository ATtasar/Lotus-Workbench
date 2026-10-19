import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
process.env.STUDIO_E2E_PASSWORD ||= randomUUID() + randomUUID();
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export default defineConfig({
  testDir: './tests/cloud-e2e',
  outputDir: './artifacts/cloud-test-results',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    launchOptions: existsSync(edge) ? { executablePath: edge } : {},
  },
  webServer: [
    {
      command: 'node backend/scripts/test-server.cjs',
      url: 'http://127.0.0.1:3031/api/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'node scripts/test-cloud-vite.mjs',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
    },
  ],
});
