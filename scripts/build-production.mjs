import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-b'],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status || 1);
const build = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    'build',
    '--mode',
    'production',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DATA_MODE: 'cloud',
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || '/api',
      VITE_APP_TARGET: process.env.VITE_APP_TARGET || 'web',
    },
  },
);
process.exit(build.status || 0);
