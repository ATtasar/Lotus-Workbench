import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { initialData } from '../desktop/model.js';

await fs.mkdir('artifacts', { recursive: true });
const root = await fs.mkdtemp(path.resolve('artifacts/desktop-launcher-'));
const base = 'http://127.0.0.1:17846';
const desktop = path.join(root, 'Desktop');
const startMenu = path.join(root, 'StartMenu');
const launcher = path.resolve('scripts/local-windows.mjs');
await fs.mkdir(desktop);
function run(args, success = true) {
  const result = spawnSync(process.execPath, [launcher, ...args, '--data-root', root], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (success) assert.equal(result.status, 0);
  else assert.notEqual(result.status, 0);
}
async function request(endpoint, body) {
  const { token } = await (
    await fetch(base + '/local-api/session', { headers: { 'X-Lotus-Local': '1' } })
  ).json();
  const response = await fetch(base + '/local-api/' + endpoint, {
    method: body ? 'POST' : 'GET',
    headers: {
      'X-Lotus-Local': '1',
      'X-Lotus-Token': token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const health = () =>
  fetch(base + '/local-api/health', { signal: AbortSignal.timeout(1000) })
    .then((r) => r.json())
    .catch(() => null);
try {
  run(['shortcut', '--desktop-dir', desktop], false);
  assert.equal((await fs.readdir(desktop)).length, 0);
  run([
    'install',
    '--port',
    '17846',
    '--desktop-dir',
    desktop,
    '--start-menu-dir',
    startMenu,
    '--no-browser',
  ]);
  const original = await request('desktop-workspace');
  const data = initialData();
  data.platforms = [{ id: 'platform1', name: '本地平台', color: '#555555', fee: 0 }];
  data.clients = [
    {
      id: 'client1',
      name: '更新测试单主',
      platforms: ['platform1'],
      preferences: '',
      dislikes: '',
      requirements: '',
      notes: '',
    },
  ];
  data.orders = [
    {
      id: 'order1',
      title: '重启持久化稿件',
      platform: 'platform1',
      client: 'client1',
      category: '测试稿件',
      deposit: 10,
      balance: 20,
      fee: 0,
      extras: [],
      stages: ['未开始', '草稿', '成图', '完成'],
      status: '草稿',
      start: '2026-10-19',
      due: '2026-10-20',
      paid: false,
      notes: '快捷方式测试',
      requirements: '',
      images: [
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      ],
    },
  ];
  await request('desktop-workspace', { data, baseRevision: original.revision });
  const before = await request('desktop-workspace');
  run(['install', '--desktop-dir', desktop, '--start-menu-dir', startMenu, '--no-browser']);
  assert.deepEqual(await request('desktop-workspace'), before);
  assert.ok(
    (await fs.readdir(path.join(root, 'backups'))).some((name) => name.includes('before-update')),
  );
  const first = await health();
  assert.equal(first.ui, 'desktop-blank');
  assert.equal(first.profile, 'desktop-only');
  assert.equal(first.dataRoot, root);
  const html = await (await fetch(base)).text();
  assert.match(html, /电脑本地版/);
  assert.doesNotMatch(html, /\/assets\/index-/);
  run(['start', '--no-browser']);
  assert.equal((await health()).pid, first.pid);
  run(['stop']);
  assert.equal(await health(), null);
  await fs.rename(path.join(root, 'config.json'), path.join(root, 'config.test-preserved.json'));
  // A stale/corrupt historical phone configuration must not break desktop startup.
  await fs.writeFile(path.join(root, 'lan-access.json'), 'invalid historical config');
  run(['start', '--no-browser']);
  assert.equal((await health()).port, 17846);
  assert.deepEqual(await request('desktop-workspace'), before);
  assert.ok(await fs.stat(path.join(root, 'config.json')));
  run(['stop']);
  const dbFile = path.join(root, 'data/workbench.sqlite');
  await fs.rename(dbFile, dbFile + '.test-preserved');
  try {
    run(['start', '--no-browser'], false);
    await assert.rejects(fs.stat(dbFile), { code: 'ENOENT' });
  } finally {
    await fs.rename(dbFile + '.test-preserved', dbFile);
  }
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:LOTUS_SHORTCUT -WindowStyle Hidden",
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, LOTUS_SHORTCUT: path.join(desktop, '创作者工作台.lnk') },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  for (let i = 0; i < 80 && !(await health()); i++)
    await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal((await health())?.ui, 'desktop-blank');
  for (let i = 0; i < 80; i++) {
    try {
      if (
        JSON.parse(await fs.readFile(path.join(root, 'runtime/last-open.json'), 'utf8')).url ===
        base
      )
        break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const desktopOpen = JSON.parse(
    await fs.readFile(path.join(root, 'runtime/last-open.json'), 'utf8'),
  );
  assert.equal(desktopOpen.url, base);
  assert.deepEqual(await request('desktop-workspace'), before);
  run(['stop']);
  assert.ok(await fs.stat(path.join(startMenu, '创作者工作台.lnk')));
  const menuLaunch = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:LOTUS_MENU_SHORTCUT -WindowStyle Hidden",
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, LOTUS_MENU_SHORTCUT: path.join(startMenu, '创作者工作台.lnk') },
    },
  );
  assert.equal(menuLaunch.status, 0, menuLaunch.stderr);
  for (let i = 0; i < 80 && !(await health()); i++)
    await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal((await health())?.ui, 'desktop-blank');
  for (let i = 0; i < 80; i++) {
    const opened = JSON.parse(await fs.readFile(path.join(root, 'runtime/last-open.json'), 'utf8'));
    if (opened.at !== desktopOpen.at) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const menuOpen = JSON.parse(await fs.readFile(path.join(root, 'runtime/last-open.json'), 'utf8'));
  assert.equal(menuOpen.url, base);
  assert.notEqual(menuOpen.at, desktopOpen.at);
  assert.deepEqual(await request('desktop-workspace'), before);
  await fs.mkdir('artifacts/desktop-validation', { recursive: true });
  await fs.writeFile(
    'artifacts/desktop-validation/launcher-result.json',
    JSON.stringify(
      {
        passed: true,
        root,
        checks: [
          'fresh install',
          'program reinstall preserves desktop data',
          'before-update backup',
          'single instance',
          'missing configuration recovery retains custom port and original database',
          'missing database refuses normal startup without creating empty database',
          'shortcut requires completed installation',
          'changed working directory does not change database',
          'corrupt historical LAN configuration ignored',
          'default browser invoked with loopback URL, no PWA dependency',
          'real Windows desktop shortcut',
          'real Windows Start menu shortcut',
          'service restart persistence',
          'desktop HTML selected',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS desktop installation, update, single instance and actual desktop / Start menu shortcuts',
  );
} finally {
  run(['stop']);
}
