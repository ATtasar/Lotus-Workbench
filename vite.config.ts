import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateApiBase } from './src/lib/apiConfig';

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (command === 'build')
    validateApiBase(env.VITE_API_BASE_URL || '/api', true, env.VITE_APP_TARGET === 'android');
  return {
    base: '/',
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      watch: {
        ignored: [
          '**/artifacts/**',
          '**/test-results/**',
          '**/backend/node_modules/**',
          '**/backend/dist/**',
          '**/deploy/private/**',
          '**/deploy/backups/**',
        ],
      },
      proxy: {
        '/api': { target: env.DEV_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
      },
    },
  };
});
