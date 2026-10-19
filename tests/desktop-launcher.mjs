import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { initialData } from '../desktop/model.js';

await fs.mkdir('artifacts', { recursive: true });
const root = await fs.mkdtemp(path.resolve('artifacts/desktop-launcher-'));
const base = 'http://127.0.0.1:17846';
const desktop = path.join(root, 'Desktop');
await fs.mkdir(desktop);
function run(args) {
  const result = spawnSync(
    process.execPath,
    ['scripts/local-windows.mjs', ...args, '--data-root', root],
    { stdio: 'inherit', windowsHide: true },
  );
  assert.equal(result.status, 0);
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
  run([
    'install',
    '--port',
    '17846',
    '--desktop-dir',
    desktop,
    '--no-browser',
    '--shortcut-no-browser',
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
  await request('desktop-workspace', { data, baseRevision: original.revision });
  const before = await request('desktop-workspace');
  run(['install', '--desktop-dir', desktop, '--no-browser', '--shortcut-no-browser']);
  assert.deepEqual(await request('desktop-workspace'), before);
  assert.ok(
    (await fs.readdir(path.join(root, 'backups'))).some((name) => name.includes('before-update')),
  );
  const first = await health();
  assert.equal(first.ui, 'desktop-blank');
  const html = await (await fetch(base)).text();
  assert.match(html, /电脑本地版/);
  assert.doesNotMatch(html, /\/assets\/index-/);
  run(['start', '--no-browser']);
  assert.equal((await health()).pid, first.pid);
  run(['stop']);
  assert.equal(await health(), null);
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
          'real Windows desktop shortcut',
          'service restart persistence',
          'desktop HTML selected',
        ],
      },
      null,
      2,
    ),
  );
  console.log('PASS desktop installation, update, single instance and actual Windows shortcut');
} finally {
  run(['stop']);
}
