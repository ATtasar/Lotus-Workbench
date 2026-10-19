import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node', exclude: ['tests/lan.test.ts'] },
});
