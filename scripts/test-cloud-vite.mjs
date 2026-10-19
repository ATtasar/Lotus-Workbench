process.env.VITE_DATA_MODE = 'cloud';
process.env.VITE_API_BASE_URL = '/api';
process.env.DEV_API_TARGET = 'http://127.0.0.1:3031';
const { createServer } = await import('vite');
const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await server.listen();
