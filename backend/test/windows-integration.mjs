// Optional real PostgreSQL acceptance test. Uses a new, isolated temporary directory.
// Run AFTER build:backend: node backend/test/windows-integration.mjs
import { spawn, execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  cpSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { get as httpGet } from 'node:http';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { seedDatabase } = require('../dist/src/data/seed.js');
const { diffDatabase } = require('../dist/src/data/changeSet.js');
const project = resolve(import.meta.dirname, '../..');
let pgBin = join(project, 'artifacts/postgres-test-tools/pgsql/bin');
if (process.platform !== 'win32' || !existsSync(join(pgBin, 'initdb.exe')))
  throw new Error(
    'Requires official Windows PostgreSQL test binaries in artifacts/postgres-test-tools/pgsql. No download/installation is performed by this test.',
  );
// PostgreSQL initdb on a Chinese Windows code page cannot bootstrap UTF8 in a non-ASCII path.
// Use a fresh ASCII temporary directory, never a production/system database directory.
const root = mkdtempSync(join(tmpdir(), 'creator-deploy-test-'));
if (/[^\x00-\x7f]/.test(root))
  throw new Error(
    'This acceptance test needs an ASCII TEMP path. Production C:\\CreatorStudio already meets this requirement.',
  );
if (/[^\x00-\x7f]/.test(pgBin)) {
  for (const name of ['bin', 'lib', 'share'])
    cpSync(join(pgBin, '..', name), join(root, 'pgsql', name), { recursive: true });
  pgBin = join(root, 'pgsql/bin');
}
const data = join(root, 'pgdata');
mkdirSync(join(root, 'config'), { recursive: true });
const password = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const origin = 'https://studio.example.test';
const url = `postgresql://creator_app:${appPassword}@127.0.0.1:5432/creator_studio`;
const envFile = join(root, 'config/backend.env');
writeFileSync(
  envFile,
  `NODE_ENV=production\nHOST=127.0.0.1\nPORT=3000\nDATABASE_URL=${url}\nPUBLIC_ORIGIN=${origin}\nCORS_ORIGINS=\nADMIN_USERNAME=creator\nADMIN_PASSWORD=${password}\nCOOKIE_SAME_SITE=Lax\nLOG_DIR=${join(root, 'logs').replaceAll('\\', '/')}\n`,
);
const adminFile = join(root, 'init-password.txt');
writeFileSync(adminFile, password, { mode: 0o600 });
const childEnv = {
  ...process.env,
  STUDIO_TEST_ADMIN_PASSWORD: password,
  // Do not inherit PowerShell 7-only modules into Windows PowerShell 5.1.
  PSModulePath:
    join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules') +
    ';' +
    join(process.env.ProgramFiles, 'WindowsPowerShell/Modules'),
};
const runPg = (tool, args) => {
  // pg_ctl's background server can inherit pipe handles on Windows. Use files, never pipes.
  const fd = openSync(join(root, 'pg-tools.log'), 'a');
  try {
    return execFileSync(join(pgBin, tool + '.exe'), args, {
      windowsHide: true,
      timeout: 60000,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    closeSync(fd);
  }
};
let api,
  pool,
  pgStarted = false;
const ps = (script, args = []) =>
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(root, 'invoke.ps1'),
      script,
      ...args,
    ],
    { env: childEnv, encoding: 'utf8', windowsHide: true, timeout: 60000 },
  );
writeFileSync(
  join(root, 'invoke.ps1'),
  `param([string]$Script)\nfunction Read-Host { param($Prompt,[switch]$AsSecureString); if($AsSecureString) { return (ConvertTo-SecureString $env:STUDIO_TEST_ADMIN_PASSWORD -AsPlainText -Force) }; return 'YES' }\n& $Script @args\n`,
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function startApi(release) {
  api = spawn(process.execPath, [join(project, 'backend/dist/backend/src/main.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3039',
      DATABASE_URL: url,
      PUBLIC_ORIGIN: origin,
      CORS_ORIGINS: '',
      ADMIN_USERNAME: 'creator',
      ADMIN_PASSWORD: password,
      LOG_DIR: join(root, 'logs'),
      STUDIO_RELEASE_ID: release,
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  api.stdout.on('data', (chunk) => {
    output += chunk;
  });
  api.stderr.on('data', (chunk) => {
    output += chunk;
  });
  for (let i = 0; i < 100; i++) {
    if (api.exitCode !== null)
      throw new Error('Backend exited; check isolated test logs (credentials withheld).');
    try {
      const health = await (await fetch('http://127.0.0.1:3039/api/health/ready')).json();
      if (health.release === release) return;
    } catch {}
    await wait(100);
  }
  throw new Error('Backend readiness timeout.');
}
async function stopApi() {
  if (api && api.exitCode === null) {
    const exited = new Promise((resolve) => api.once('exit', resolve));
    api.kill();
    await exited;
  }
  api = null;
}
let cookie = '';
async function request(path, body) {
  return fetch('http://127.0.0.1:3039/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
try {
  // Refuse to touch ANY existing database listener. initdb always targets a fresh UUID directory.
  const net = await import('node:net');
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(new Error('Local port 5432 is occupied; test cancelled without database changes.')),
    );
    server.listen(5432, '127.0.0.1', () => server.close(resolve));
  });
  runPg('initdb', [
    '-D',
    data,
    '-U',
    'postgres',
    '--auth-host=scram-sha-256',
    '--auth-local=scram-sha-256',
    '--pwfile=' + adminFile,
    '--encoding=UTF8',
    '--locale=C',
  ]);
  runPg('pg_ctl', [
    '-D',
    data,
    '-l',
    join(root, 'postgres.log'),
    '-o',
    '-h 127.0.0.1 -p 5432',
    '-w',
    'start',
  ]);
  pgStarted = true;
  console.log('PASS: isolated PostgreSQL started on loopback.');
  const init = join(project, 'deploy/windows/Initialize-Database.ps1');
  ps(init, ['-InstallRoot', root, '-PgBin', pgBin]);
  assert.throws(
    () => execFileSync(process.execPath, [join(project, 'backend/dist/backend/src/main.js')], {
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: url.replace(appPassword, 'incorrect-test-password'), HOST: '127.0.0.1', PORT: '3039', ADMIN_PASSWORD: password },
      windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    }),
    error => error.status === 1 && error.stderr.toString().includes('28P01') && !error.stderr.toString().includes(appPassword) && !error.stderr.toString().includes('postgresql://'),
  );
  await startApi('acceptance-first');
  const login = await request('auth/login', { username: 'creator', password });
  assert.equal(login.status, 201);
  assert.match(login.headers.get('set-cookie'), /Secure/);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const initial = await (await request('workspace')).json();
  assert.equal(initial.data.orders.length, 0);
  const next = seedDatabase();
  const bytes = Buffer.from('persisted test attachment');
  next.orders[0].attachments = [
    {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: 'acceptance.txt',
      mime: 'text/plain',
      size: bytes.length,
      data: 'data:text/plain;base64,' + bytes.toString('base64'),
    },
  ];
  const save = await request('workspace/changesets', {
    baseRevision: 0,
    requestId: randomUUID(),
    changes: diffDatabase(initial.data, next),
  });
  assert.equal(save.status, 201);
  const saved = await (await request('workspace')).json();
  assert.deepEqual(saved.data, next);
  pool = new Pool({ connectionString: url });
  const originalHash = (await pool.query('SELECT password_hash FROM studio_users')).rows[0]
    .password_hash;
  const backupScript = join(project, 'deploy/windows/Backup-Database.ps1');
  const backup = ps(backupScript, ['-InstallRoot', root, '-PgBin', pgBin, '-NoPrune'])
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.endsWith('.dump'))
    .at(-1);
  assert.ok(backup && existsSync(backup));
  assert.ok(existsSync(backup + '.sha256'));
  await stopApi();
  await pool.end();
  pool = null;
  runPg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  pgStarted = false;
  runPg('pg_ctl', [
    '-D',
    data,
    '-l',
    join(root, 'postgres.log'),
    '-o',
    '-h 127.0.0.1 -p 5432',
    '-w',
    'start',
  ]);
  pgStarted = true;
  // Re-run initializer with existing data. It must back up first and must not reset passwords.
  ps(init, ['-InstallRoot', root, '-PgBin', pgBin]);
  await startApi('acceptance-restarted');
  assert.deepEqual((await (await request('workspace')).json()).data, next);
  pool = new Pool({ connectionString: url });
  assert.equal(
    (await pool.query('SELECT password_hash FROM studio_users')).rows[0].password_hash,
    originalHash,
  );
  const restored = ps(join(project, 'deploy/windows/Restore-Database.ps1'), [
    '-InstallRoot',
    root,
    '-PgBin',
    pgBin,
    '-BackupFile',
    backup,
  ]);
  const name = restored.match(/Restore succeeded into (creator_restore_[a-z0-9_]+)/)?.[1];
  assert.ok(name);
  const restoredPool = new Pool({ connectionString: url.replace('/creator_studio', '/' + name) });
  try {
    assert.deepEqual(
      (await restoredPool.query('SELECT data FROM studio_workspaces')).rows,
      (await pool.query('SELECT data FROM studio_workspaces')).rows,
    );
    assert.deepEqual(
      (await restoredPool.query('SELECT hash,mime,content FROM studio_files')).rows,
      (await pool.query('SELECT hash,mime,content FROM studio_files')).rows,
    );
    assert.equal(
      (await restoredPool.query('SELECT password_hash FROM studio_users')).rows[0].password_hash,
      originalHash,
    );
  } finally {
    await restoredPool.end();
  }
  // Tampered archives must fail BEFORE prompting/creating a new database.
  const tampered = join(root, 'tampered.dump');
  writeFileSync(tampered, readFileSync(backup));
  writeFileSync(tampered + '.sha256', '0'.repeat(64));
  assert.throws(
    () =>
      ps(join(project, 'deploy/windows/Restore-Database.ps1'), [
        '-InstallRoot',
        root,
        '-PgBin',
        pgBin,
        '-BackupFile',
        tampered,
      ]),
    (error) => error.stderr.toString().includes('checksum mismatch'),
  );
  const caddy = join(project, 'artifacts/deploy-tools/caddy.exe');
  if (existsSync(caddy)) {
    mkdirSync(join(root, 'bin'), { recursive: true });
    cpSync(caddy, join(root, 'bin/caddy.exe'));
    const release = join(root, 'releases/gateway-test');
    mkdirSync(join(release, 'web'), { recursive: true });
    ps(join(project, 'deploy/windows/Set-Gateway.ps1'), [
      '-InstallRoot',
      root,
      '-Release',
      release,
      '-Domain',
      'studio.example.test',
    ]);
    assert.match(readFileSync(envFile, 'utf8'), /PUBLIC_ORIGIN=https:\/\/studio.example.test/);
    ps(join(project, 'deploy/windows/Set-Gateway.ps1'), [
      '-InstallRoot',
      root,
      '-Release',
      release,
    ]);
    let gateway = readFileSync(join(root, 'config/Caddyfile'), 'utf8');
    gateway = gateway
      .replace('http://47.109.199.148 {', 'http://47.109.199.148:18081 {\n  bind 127.0.0.1')
      .replace('127.0.0.1:3000', '127.0.0.1:3039')
      .replace('admin localhost:2019', 'admin off');
    const gatewayFile = join(root, 'config/test.Caddyfile');
    writeFileSync(gatewayFile, gateway);
    const gatewayProcess = spawn(
      caddy,
      ['run', '--config', gatewayFile, '--adapter', 'caddyfile'],
      { windowsHide: true, stdio: 'ignore' },
    );
    const probeGateway = (path) =>
      new Promise((resolve, reject) => {
        const req = httpGet(
          { hostname: '127.0.0.1', port: 18081, path, headers: { Host: '47.109.199.148:18081' } },
          (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ status: res.statusCode, body }));
          },
        );
        req.on('error', reject);
        req.setTimeout(2000, () => req.destroy(new Error('Gateway probe timeout')));
      });
    try {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try {
          const response = await probeGateway('/api/health/ready');
          if (response.status === 200 && JSON.parse(response.body).status === 'ok') {
            ready = true;
            break;
          }
        } catch {}
        await wait(100);
      }
      assert.ok(ready, 'Caddy loopback test gateway did not start');
      assert.equal((await probeGateway('/api/auth/session')).status, 503);
      writeFileSync(
        join(root, 'probe.ps1'),
        `$ErrorActionPreference='Stop'\n$r=Invoke-RestMethod 'http://127.0.0.1:18081/api/health/ready' -Headers @{Host='47.109.199.148:18081'} -TimeoutSec 5\nif($r.status -ne 'ok') { throw 'Probe failed' }\nWrite-Output PROBE_OK\n`,
      );
      assert.match(ps(join(root, 'probe.ps1')), /PROBE_OK/);
      console.log(
        'PASS: Caddy HTTPS/IP configs validate; IP gateway exposes health only; Windows PowerShell 5.1 Host-header health probe works.',
      );
    } finally {
      if (gatewayProcess.exitCode === null) {
        const exited = new Promise((resolve) => gatewayProcess.once('exit', resolve));
        gatewayProcess.kill();
        await exited;
      }
    }
  }
  console.log(
    'PASS: real PostgreSQL 17 initialization + repeated migration, production API health/login/save, API and database restart persistence, unchanged passwords, verified backup/full restore (workspace + binary attachments), tampered backup rejection.',
  );
  console.log('Isolated test artifacts: ' + root);
} finally {
  await stopApi();
  if (pool) await pool.end();
  if (pgStarted) runPg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
}
