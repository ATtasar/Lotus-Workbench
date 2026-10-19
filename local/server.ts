import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { APP_ID, LocalStore, LocalConflict } from './store';
import { LanAccess } from './lan';

export async function serveLocal(options: {
  root: string;
  web: string;
  port: number;
  instance: string;
}) {
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535)
    throw new Error('本机端口必须在 1024–65535 范围。');
  const rawBase = process.env.LOTUS_API_BASE_URL || '/local-api/';
  if (!/^\/[a-zA-Z0-9_-][a-zA-Z0-9_/-]*\/?$/.test(rawBase) || rawBase.includes('//'))
    throw new Error(
      'LOTUS_API_BASE_URL 必须为同源 API 路径，例如 /local-api/，不能指向外部服务器。',
    );
  const apiBase = rawBase.endsWith('/') ? rawBase : rawBase + '/';
  fs.mkdirSync(path.join(options.root, 'runtime'), { recursive: true });
  const lockFile = path.join(options.root, 'runtime/service.lock'),
    stateFile = path.join(options.root, 'runtime/service.json');
  const lock = fs.openSync(lockFile, 'wx');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, instance: options.instance }));
  let store!: LocalStore, access!: LanAccess;
  try {
    store = new LocalStore(options.root);
    access = new LanAccess(options.root);
  } catch (error) {
    store?.close();
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
    throw error;
  }
  const token = randomBytes(32).toString('hex'),
    localOrigin = 'http://127.0.0.1:' + options.port;
  let closing = false,
    configuring = false,
    lanServer: http.Server | undefined,
    lanError = '',
    lastRemoteBackup = 0;
  const lanStatus = () => ({
    ...access.publicStatus(),
    active: !!lanServer?.listening,
    error: lanError,
    port: options.port,
    mobileUrl: access.config.enabled
      ? 'http://' + access.config.address + ':' + options.port + '/mobile/'
      : '',
  });
  function close() {
    if (closing) return;
    closing = true;
    const localClose = () => {
      server.close(() => {
        store.close();
        fs.closeSync(lock);
        for (const file of [stateFile, lockFile]) if (fs.existsSync(file)) fs.unlinkSync(file);
      });
      server.closeIdleConnections();
    };
    if (lanServer) {
      lanServer.close(localClose);
      lanServer.closeIdleConnections();
    } else localClose();
  }
  const makeServer = (origin: string, isLan: boolean) => {
    const current = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
      const json = (code: number, value: unknown) => {
        res.writeHead(code, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(JSON.stringify(value));
      };
      try {
        if (closing) return json(503, { message: '服务正在停止，当前修改尚未保存。' });
        if (req.headers.host !== new URL(origin).host)
          return json(403, { message: '访问地址不正确。' });
        const address = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        if (isLan && !access.allowed(address))
          return json(403, { message: '当前设备 IP 未获电脑授权。' });
        const url = new URL(req.url || '/', origin);
        const prefix = url.pathname.startsWith(apiBase)
          ? apiBase
          : !isLan && url.pathname.startsWith('/local-api/')
            ? '/local-api/'
            : '';
        if (prefix) {
          const endpoint = url.pathname.slice(prefix.length);
          if (
            (req.headers.origin && req.headers.origin !== origin) ||
            req.headers['sec-fetch-site'] === 'cross-site'
          )
            return json(403, { message: '拒绝跨站访问电脑数据。' });
          if (endpoint === 'health' && req.method === 'GET')
            return json(
              200,
              isLan
                ? { appId: APP_ID, status: 'ok', ui: 'mobile', requiresPairing: true }
                : {
                    appId: APP_ID,
                    instance: options.instance,
                    status: 'ok',
                    ui: 'desktop-blank',
                    protocol: 2,
                    pid: process.pid,
                    apiBase,
                  },
            );
          if (req.headers['x-lotus-local'] !== '1')
            return json(403, { message: '无效的工作台请求。' });
          const readBody = async (max = 128 * 1024 * 1024) => {
            if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json')
              throw Object.assign(new Error('请求类型不正确。'), { status: 405 });
            if (isLan && req.headers.origin !== origin)
              throw Object.assign(new Error('修改请求必须来自当前手机页面。'), { status: 403 });
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const chunk of req) {
              bytes += chunk.length;
              if (bytes > max)
                throw Object.assign(new Error('请求超过允许大小。'), { status: 413 });
              chunks.push(chunk);
            }
            return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          };
          if (isLan && endpoint === 'lan/pair') {
            const body = await readBody(4096);
            const paired = access.pair(address, body.code, body.name);
            res.setHeader(
              'Set-Cookie',
              'LotusDevice=' +
                paired.credential +
                '; HttpOnly; SameSite=Strict; Path=' +
                apiBase +
                '; Max-Age=2592000',
            );
            return json(200, { paired: true, name: paired.device.name });
          }
          const device = isLan ? access.authenticate(address, req.headers.cookie) : undefined;
          if (isLan && !device)
            return json(401, {
              message: '请使用电脑生成的配对码连接，或在电脑端重新授权。',
              needsPairing: true,
            });
          const expected = isLan ? access.csrf(device!) : token;
          if (endpoint === 'session' && req.method === 'GET')
            return json(200, { token: expected, localAccess: !isLan });
          if (req.headers['x-lotus-token'] !== expected)
            return json(403, { message: '服务连接已更新，请刷新页面后再保存。' });
          if (isLan && !['desktop-workspace', 'revision', 'backup'].includes(endpoint))
            return json(403, { message: '此管理操作仅能在电脑本机执行。' });
          if (req.method === 'GET') {
            if (endpoint === 'desktop-workspace') return json(200, store.loadDesktop());
            if (endpoint === 'revision') return json(200, { revision: store.desktopRevision() });
            if (!isLan && endpoint === 'workspace') return json(200, store.load());
            if (!isLan && endpoint === 'lan/status') return json(200, lanStatus());
            return json(404, { message: '工作台接口不存在。' });
          }
          const body = await readBody(endpoint.startsWith('lan/') ? 16384 : undefined);
          // Recheck after awaiting the request body: a device may have been
          // revoked, removed from the allowlist or disabled during an upload.
          if (isLan && !access.authenticate(address, req.headers.cookie))
            return json(401, { message: '设备授权已撤销，修改未写入。' });
          if (endpoint === 'desktop-workspace')
            return json(200, { revision: store.saveDesktop(body.data, body.baseRevision) });
          if (!isLan && endpoint === 'workspace')
            return json(200, { revision: store.save(body.data, body.baseRevision) });
          if (endpoint === 'backup') {
            if (isLan && Date.now() - lastRemoteBackup < 30000)
              return json(429, { message: '电脑刚完成一次备份，请稍后再试。' });
            const backup = store.backup();
            if (isLan) lastRemoteBackup = Date.now();
            return json(200, { path: isLan ? '已保存到电脑的备份目录' : backup });
          }
          if (!isLan && endpoint === 'lan/config') {
            await configureLan(body);
            return json(200, lanStatus());
          }
          if (!isLan && endpoint === 'lan/code') return json(200, access.issueCode());
          if (!isLan && endpoint === 'lan/revoke') {
            access.revoke(body.id);
            return json(200, lanStatus());
          }
          if (!isLan && endpoint === 'stop') {
            json(200, { stopping: true });
            setTimeout(close, 50);
            return;
          }
          return json(404, { message: '工作台接口不存在。' });
        }
        if (req.method !== 'GET' && req.method !== 'HEAD')
          return json(405, { message: '只支持读取页面。' });
        if (url.pathname === '/runtime-config.js') {
          res.writeHead(200, {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          return res.end(
            'window.LOTUS_CONFIG=' +
              JSON.stringify({ apiBase, localAccess: !isLan, pollIntervalMs: 3000 }) +
              ';',
          );
        }
        let name = decodeURIComponent(url.pathname);
        if (name === '/mobile') {
          res.writeHead(308, { Location: '/mobile/' });
          return res.end();
        }
        if (name === '/' || name === '/mobile/') name += 'index.html';
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
        const code = error instanceof LocalConflict ? 409 : Number((error as any)?.status) || 400;
        if (code === 400 && !isLan) console.error(new Date().toISOString(), error);
        if (!res.headersSent && !res.destroyed)
          json(code, {
            message: error instanceof Error ? error.message : '操作失败，电脑原数据保留。',
          });
      }
    });
    current.requestTimeout = 120000;
    current.headersTimeout = 10000;
    return current;
  };
  const server = makeServer(localOrigin, false);
  const listen = (current: http.Server, address: string) =>
    new Promise<void>((resolve, reject) => {
      current.once('error', reject);
      current.listen(options.port, address, resolve);
    });
  async function stopLan() {
    const current = lanServer;
    lanServer = undefined;
    if (current)
      await new Promise<void>((resolve) => {
        current.close(() => resolve());
        current.closeIdleConnections();
      });
  }
  async function startLan() {
    if (!access.config.enabled) return;
    access.validate(access.config.address, access.config.trustedAddresses);
    const current = makeServer('http://' + access.config.address + ':' + options.port, true);
    await listen(current, access.config.address);
    lanServer = current;
    lanError = '';
  }
  async function configureLan(body: any) {
    if (configuring)
      throw Object.assign(new Error('手机连接配置正在变更，请稍后再试。'), { status: 409 });
    if (typeof body.enabled !== 'boolean') throw new Error('手机联动启用状态不正确。');
    if (body.enabled) access.validate(body.address, body.trustedAddresses);
    configuring = true;
    try {
      await stopLan();
      const previous = structuredClone(access.config);
      try {
        access.configure(body.enabled, body.address, body.trustedAddresses);
        await startLan();
        lanError = '';
      } catch (error) {
        access.restore({ ...previous, devices: access.config.devices });
        try {
          await startLan();
        } catch (restoreError) {
          lanError = (restoreError as Error).message;
        }
        throw error;
      }
    } finally {
      configuring = false;
    }
  }
  try {
    await listen(server, '127.0.0.1');
  } catch (error) {
    store.close();
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
    throw error;
  }
  try {
    await startLan();
  } catch (error) {
    lanError = (error as Error).message;
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
        apiBase,
      },
      null,
      2,
    ),
  );
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  console.log('本地工作台已启动：' + localOrigin);
  return { server, store, close, lanStatus };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    get = (n: string) => args[args.indexOf(n) + 1];
  serveLocal({
    root: get('--root'),
    web: get('--web'),
    port: Number(get('--port')),
    instance: get('--instance'),
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
