import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const root = path.resolve('artifacts/local-deployment-test'),
  base = 'http://127.0.0.1:17842';
function run(args) {
  const r = spawnSync(
    process.execPath,
    ['scripts/local-windows.mjs', ...args, '--data-root', root],
    { stdio: 'inherit', windowsHide: true },
  );
  assert.equal(r.status, 0);
}
async function health() {
  try {
    return await (
      await fetch(base + '/local-api/health', { signal: AbortSignal.timeout(800) })
    ).json();
  } catch {
    return null;
  }
}
async function data() {
  const { token } = await (
    await fetch(base + '/local-api/session', { headers: { 'X-Lotus-Local': '1' } })
  ).json();
  return (
    await (
      await fetch(base + '/local-api/workspace', {
        headers: { 'X-Lotus-Local': '1', 'X-Lotus-Token': token },
      })
    ).json()
  ).data;
}
try {
  await fs.mkdir(path.join(root, 'Desktop'), { recursive: true });
  const installed = await fs.access(path.join(root, 'config.json')).then(
    () => true,
    () => false,
  );
  if (installed) run(['start', '--no-browser']);
  else
    run([
      'install',
      '--desktop-dir',
      path.join(root, 'Desktop'),
      '--no-browser',
      '--shortcut-no-browser',
    ]);
  if (!(await data()).orders.length) {
    const seed = spawnSync(process.execPath, ['tests/local-e2e.mjs'], {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, LOCAL_TEST_URL: base, LOCAL_TEST_ROOT: root },
    });
    assert.equal(seed.status, 0);
  }
  const before = await data();
  assert.ok(
    before.orders.length > 0,
    'Run the initial browser test on the fixture once before launcher validation',
  );
  run([
    'install',
    '--desktop-dir',
    path.join(root, 'Desktop'),
    '--no-browser',
    '--shortcut-no-browser',
  ]);
  assert.deepEqual(await data(), before);
  assert.ok(
    (await fs.readdir(path.join(root, 'backups'))).some((n) => n.includes('before-update')),
  );
  console.log(
    'PASS program reinstall/update preserves all SQLite records and image bytes and creates an update backup',
  );
  const first = await health();
  run(['start', '--no-browser']);
  assert.equal((await health()).pid, first.pid);
  run(['stop']);
  assert.equal(await health(), null);
  run(['start', '--no-browser']);
  assert.deepEqual(await data(), before);
  console.log(
    'PASS repeated launch reuses one service and service stop/restart preserves committed records',
  );
  run(['stop']);
  const shortcut = path.join(root, 'Desktop', '创作者工作台.lnk');
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:LOTUS_SHORTCUT -WindowStyle Hidden",
    ],
    { windowsHide: true, encoding: 'utf8', env: { ...process.env, LOTUS_SHORTCUT: shortcut } },
  );
  assert.equal(r.status, 0, r.stderr);
  for (let n = 0; n < 80 && !(await health()); n++) await new Promise((r) => setTimeout(r, 250));
  assert.equal((await health())?.appId, 'lotus-workbench-windows-v1');
  assert.deepEqual(await data(), before);
  console.log(
    'PASS real Windows .lnk launches Start-Local.cmd and starts the intended local service',
  );
  await fs.writeFile(
    'artifacts/local-validation/launcher-result.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          'install',
          'update-preserves-data',
          'update-backup',
          'single-instance',
          'stop-restart',
          'windows-shortcut',
        ],
        physicalReboot: 'not-run',
      },
      null,
      2,
    ),
  );
} finally {
  run(['stop']);
}
