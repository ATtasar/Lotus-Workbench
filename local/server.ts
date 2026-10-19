import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { APP_ID, LocalStore, LocalConflict } from './store';

export async function serveLocal(options: {
  root: string;
  web: string;
  port: number;
  instance: string;
}) {
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535)
    throw new Error('本机端口必须在 1024–65535 范围。');
  fs.mkdirSync(path.join(options.root, 'runtime'), { recursive: true });
  const lockFile = path.join(options.root, 'runtime/service.lock');
  const lock = fs.openSync(lockFile, 'wx');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, instance: options.instance }));
  let store: LocalStore;
  try {
    store = new LocalStore(options.root);
  } catch (e) {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
    throw e;
  }
  const token = randomBytes(32).toString('hex'),
    origin = `http://127.0.0.1:${options.port}`;
  const stateFile = path.join(options.root, 'runtime/service.json');
  let closing = false;
  function close() {
    if (closing) return;
    closing = true;
    server.close(() => {
      store.close();
      fs.closeSync(lock);
      for (const file of [stateFile, lockFile]) if (fs.existsSync(file)) fs.unlinkSync(file);
    });
    server.closeIdleConnections();
  }
  const server = http.createServer(async (req, res) => {
    const json = (code: number, value: unknown) => {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    try {
      if (req.headers.host !== `127.0.0.1:${options.port}`)
        return json(403, { message: '只允许使用固定本机地址。' });
      const url = new URL(req.url || '/', origin);
      if (url.pathname.startsWith('/local-api/')) {
        if (
          (req.headers.origin && req.headers.origin !== origin) ||
          req.headers['sec-fetch-site'] === 'cross-site'
        )
          return json(403, { message: '拒绝跨站访问本机数据。' });
        if (url.pathname === '/local-api/health' && req.method === 'GET')
          return json(200, {
            appId: APP_ID,
            instance: options.instance,
            status: 'ok',
            ui: 'desktop-blank',
            pid: process.pid,
          });
        if (req.headers['x-lotus-local'] !== '1') return json(403, { message: '无效的本机请求。' });
        if (url.pathname === '/local-api/session' && req.method === 'GET')
          return json(200, { token });
        if (req.headers['x-lotus-token'] !== token)
          return json(403, { message: '本地服务已重启，请刷新页面。' });
        if (url.pathname === '/local-api/workspace' && req.method === 'GET')
          return json(200, store.load());
        if (url.pathname === '/local-api/desktop-workspace' && req.method === 'GET')
          return json(200, store.loadDesktop());
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json')
          return json(405, { message: '请求类型不正确。' });
        let bytes = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 128 * 1024 * 1024)
            return json(413, { message: '工作区或导入文件超过 128 MB。' });
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (url.pathname === '/local-api/workspace')
          return json(200, { revision: store.save(body.data, body.baseRevision) });
        if (url.pathname === '/local-api/desktop-workspace')
          return json(200, { revision: store.saveDesktop(body.data, body.baseRevision) });
        if (url.pathname === '/local-api/backup') return json(200, { path: store.backup() });
        if (url.pathname === '/local-api/stop') {
          json(200, { stopping: true });
          setTimeout(close, 50);
          return;
        }
        return json(404, { message: '本机接口不存在。' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return json(405, { message: '只支持读取页面。' });
      let name = decodeURIComponent(url.pathname);
      if (name === '/') name = '/index.html';
      if (name.includes('\\') || name.split('/').some((x) => x === '..' || x.startsWith('.')))
        return json(403, { message: '无效路径。' });
      const file = path.resolve(options.web, '.' + name);
      if (
        !file.startsWith(path.resolve(options.web) + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      )
        return json(404, { message: '页面资源不存在。请重新执行本地安装。' });
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error(new Date().toISOString(), error);
      json(error instanceof LocalConflict ? 409 : 400, {
        message: error instanceof Error ? error.message : '本地操作失败，原数据保留。',
      });
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', resolve);
    });
  } catch (e) {
    store.close();
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
    throw e;
  }
  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        appId: APP_ID,
        pid: process.pid,
        instance: options.instance,
        port: options.port,
        token,
        web: options.web,
      },
      null,
      2,
    ),
  );
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  console.log(`本地工作台已启动：${origin}`);
  return { server, store, close };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    get = (n: string) => args[args.indexOf(n) + 1];
  serveLocal({
    root: get('--root'),
    web: get('--web'),
    port: Number(get('--port')),
    instance: get('--instance'),
  }).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
