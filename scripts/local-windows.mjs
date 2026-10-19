import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import os from 'node:os';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2),
  command = args[0],
  value = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
const root = path.resolve(
  value('--data-root') ||
    process.env.LOTUS_LOCAL_ROOT ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Lotus-Workbench')
      : path.join(
          process.env.USERPROFILE || process.env.HOME || source,
          '.local/share/Lotus-Workbench',
        )),
);
const configFile = path.join(root, 'config.json'),
  stateFile = path.join(root, 'runtime/service.json');
const appId = 'lotus-workbench-windows-v1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
const readState = () => {
  try {
    return readJSON(stateFile);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};
function checkNode() {
  if (Number(process.versions.node.split('.')[0]) !== 24)
    throw new Error(
      '请安装 Node.js 24 LTS（https://nodejs.org/），重新打开终端后再安装。无需管理员命令配置数据库。',
    );
}
function config() {
  if (!fs.existsSync(configFile))
    throw new Error('本机尚未安装，请先运行 Install-Local.cmd 或 npm run local:install。');
  const c = readJSON(configFile);
  if (c.appId !== appId || !Number.isInteger(c.port) || c.port < 1024 || c.port > 65535)
    throw new Error('本地配置损坏，原数据保留，请检查 config.json。');
  return c;
}
async function health(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/local-api/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
async function api(endpoint, payload = {}, method = 'POST') {
  const state = readState();
  if (!state || state.appId !== appId) throw new Error('本机服务未运行。');
  const h = await health(state.port);
  if (!h || h.instance !== state.instance || h.pid !== state.pid)
    throw new Error('服务身份不匹配，不会操作其他进程。');
  const r = await fetch(
    `http://127.0.0.1:${state.port}${state.apiBase || '/local-api/'}${endpoint}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Lotus-Local': '1',
        'X-Lotus-Token': state.token,
      },
      ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(120000),
    },
  );
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || '本地服务操作失败。');
  return body;
}
async function cleanupStaleLock(file) {
  if (!fs.existsSync(file)) return;
  const old = readJSON(file);
  if (!Number.isInteger(old.pid) || alive(old.pid))
    throw new Error('另一个启动或服务进程仍存在。请先停止工作台；不会强制终止未知进程。');
  fs.unlinkSync(file);
}
function run(exe, argv, env = process.env) {
  const r = spawnSync(exe, argv, { cwd: source, env, stdio: 'inherit', windowsHide: true });
  if (r.error) throw r.error;
  if (r.status !== 0)
    throw new Error(`命令失败，退出码 ${r.status ?? '未知'}：${path.basename(exe)}`);
}
function npm(argv) {
  if (process.platform === 'win32')
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm', ...argv]);
  else run('npm', argv);
}
async function openBrowser(url) {
  if (args.includes('--no-browser')) return;
  if (args.includes('--connect-phone')) url += '/?connect=phone';
  const script = "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:LOTUS_LOCAL_URL";
  if (process.platform === 'win32') {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, LOTUS_LOCAL_URL: url },
    });
    if (r.status !== 0) throw new Error('服务已就绪，但默认浏览器未能自动打开。请访问：' + url);
  } else console.log('浏览器地址：' + url);
}
async function start() {
  checkNode();
  const c = config();
  const url = `http://127.0.0.1:${c.port}`;
  fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
  const lock = path.join(root, 'runtime/start.lock');
  if (fs.existsSync(lock)) {
    // A concurrent shortcut launch waits for the first launcher, then reuses it.
    for (let n = 0; n < 40 && fs.existsSync(lock); n++) {
      const h = await health(c.port);
      if (h?.appId === appId && h.ui === 'desktop-blank' && h.protocol === 2) {
        console.log('复用已运行服务：' + url);
        await openBrowser(url);
        return;
      }
      await sleep(250);
    }
    await cleanupStaleLock(lock);
  }
  const fd = fs.openSync(lock, 'wx');
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
  try {
    const h = await health(c.port),
      state = readState();
    if (h?.appId === appId && state?.instance === h.instance) {
      if (h.protocol !== 2)
        throw new Error('本地服务需要更新，请先运行 Install-Local.cmd，现有数据会保留。');
      if (h.ui !== 'desktop-blank')
        throw new Error(
          '旧手机界面服务仍在运行。请运行 Install-Local.cmd 安全更新为电脑端，原数据库会保留。',
        );
      if (path.resolve(state.web) !== path.join(source, 'local-dist/web'))
        throw new Error('另一个程序目录的工作台正在运行，请先 Stop-Local 再运行安装脚本更新。');
      console.log('服务已运行：' + url);
      await openBrowser(url);
      return;
    }
    if (h) throw new Error('端口被其他服务占用，不会停止该服务。请检查本地配置。');
    if (
      !fs.existsSync(path.join(source, 'local-dist/server.mjs')) ||
      !fs.existsSync(path.join(source, 'local-dist/web/index.html'))
    )
      throw new Error('缺少本地构建资源，请重新运行安装脚本。');
    await cleanupStaleLock(path.join(root, 'runtime/service.lock'));
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
    const log = path.join(
      root,
      'logs',
      'service-' + new Date().toISOString().replace(/[:.]/g, '-') + '.log',
    );
    const output = fs.openSync(log, 'a'),
      instance = randomUUID();
    const child = spawn(
      process.execPath,
      [
        path.join(source, 'local-dist/server.mjs'),
        '--root',
        root,
        '--port',
        String(c.port),
        '--web',
        path.join(source, 'local-dist/web'),
        '--instance',
        instance,
      ],
      { cwd: source, windowsHide: true, detached: true, stdio: ['ignore', output, output] },
    );
    let failure;
    child.once('error', (e) => {
      failure = e;
    });
    child.unref();
    fs.closeSync(output);
    for (let n = 0; n < 80; n++) {
      const ready = await health(c.port);
      if (ready?.appId === appId && ready.instance === instance) {
        console.log('工作台已就绪：' + url);
        console.log('数据目录：' + path.join(root, 'data'));
        await openBrowser(url);
        return;
      }
      if (failure || child.exitCode !== null) break;
      await sleep(250);
    }
    throw new Error(
      '本地服务未能就绪，未终止其他进程。请查看日志：' +
        log +
        (failure ? '；' + failure.message : ''),
    );
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
async function stop() {
  const state = readState();
  if (!state) {
    console.log('工作台服务未运行。');
    return;
  }
  const h = await health(state.port);
  if (!h) {
    if (alive(state.pid))
      throw new Error('原进程仍存在但健康检查失败。请检查日志；不会强制杀进程。');
    await cleanupStaleLock(path.join(root, 'runtime/service.lock'));
    fs.unlinkSync(stateFile);
    console.log('已清理退出服务的状态文件。');
    return;
  }
  await api('stop');
  for (let n = 0; n < 80; n++) {
    if (!(await health(state.port))) {
      console.log('工作台服务已停止。');
      return;
    }
    await sleep(250);
  }
  throw new Error('停止尚未完成，请检查日志；没有执行强制终止。');
}
async function shortcut() {
  if (process.platform !== 'win32') throw new Error('桌面快捷方式只支持 Windows 10/11。');
  const script = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$desktop=if($env:LOTUS_DESKTOP_DIR){$env:LOTUS_DESKTOP_DIR}else{[Environment]::GetFolderPath('Desktop')}
if(-not(Test-Path -LiteralPath $desktop)){throw 'Desktop directory missing'}
$destinations=@($desktop)
if($env:LOTUS_START_MENU_DIR){$menu=$env:LOTUS_START_MENU_DIR}
elseif(-not $env:LOTUS_DESKTOP_DIR){$menu=[Environment]::GetFolderPath('Programs')}
else{$menu=$null}
if($menu){New-Item -ItemType Directory -Path $menu -Force | Out-Null; $destinations+=,$menu}
$shell=New-Object -ComObject WScript.Shell
foreach($destination in $destinations){
  $shortcutPath=Join-Path $destination $env:LOTUS_SHORTCUT_NAME
  $shortcut=$shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath=$env:ComSpec
  $shortcut.Arguments='/d /c ""'+$env:LOTUS_START_SCRIPT+'" --data-root "'+$env:LOTUS_LOCAL_DATA_ROOT+'"'+$env:LOTUS_SHORTCUT_EXTRA+'"'
  $shortcut.WorkingDirectory=$env:LOTUS_SOURCE
  $shortcut.Description=$env:LOTUS_SHORTCUT_DESCRIPTION
  $shortcut.WindowStyle=7
  $shortcut.Save()
  Write-Output $shortcutPath
}`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      LOTUS_DESKTOP_DIR: value('--desktop-dir') ? path.resolve(value('--desktop-dir')) : '',
      LOTUS_START_MENU_DIR: value('--start-menu-dir')
        ? path.resolve(value('--start-menu-dir'))
        : '',
      LOTUS_SHORTCUT_NAME: '创作者工作台.lnk',
      LOTUS_SHORTCUT_DESCRIPTION: '启动本机创作者工作台',
      LOTUS_START_SCRIPT: path.join(source, 'Start-Local.cmd'),
      LOTUS_SOURCE: source,
      LOTUS_LOCAL_DATA_ROOT: root,
      LOTUS_SHORTCUT_EXTRA: args.includes('--shortcut-no-browser') ? ' --no-browser' : '',
    },
  });
  if (r.status !== 0) throw new Error('创建桌面快捷方式失败：' + (r.stderr || r.error?.message));
  console.log('已创建启动快捷方式：\n' + r.stdout.trim());
}
async function storeModule() {
  return import(pathToFileURL(path.join(source, 'local-dist/store.mjs')).href);
}
async function backup() {
  const state = readState();
  if (state && (await health(state.port))) {
    const r = await api('backup');
    console.log('完整备份：' + r.path);
    return r.path;
  }
  await cleanupStaleLock(path.join(root, 'runtime/service.lock'));
  const { LocalStore } = await storeModule(),
    store = new LocalStore(root);
  try {
    const file = store.backup();
    console.log('完整备份：' + file);
    return file;
  } finally {
    store.close();
  }
}
async function install() {
  checkNode();
  if (process.platform !== 'win32' && !args.includes('--test'))
    throw new Error('此安装程序面向 Windows 10/11。');
  if (process.platform === 'win32' && Number(os.release().split('.')[0]) < 10)
    throw new Error('需要 Windows 10/11。');
  console.log('正在检查本地环境。无需 PostgreSQL、云账号、管理员权限或防火墙规则。');
  const settings = fs.existsSync(configFile)
    ? config()
    : { appId, port: Number(value('--port') || 17841) };
  if (!Number.isInteger(settings.port) || settings.port < 1024 || settings.port > 65535)
    throw new Error('端口无效。');
  const running = readState();
  if (running) await stop();
  const manifest = readJSON(path.join(source, 'package.json'));
  const lockHash = createHash('sha256')
    .update(fs.readFileSync(path.join(source, 'package-lock.json')))
    .digest('hex');
  const missing = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
    (name) => !fs.existsSync(path.join(source, 'node_modules', name, 'package.json')),
  );
  if (
    missing.length ||
    (settings.lockHash && settings.lockHash !== lockHash) ||
    args.includes('--refresh-dependencies')
  )
    npm(['ci', '--no-audit', '--no-fund']);
  npm(['--version']);
  let built = false;
  if (fs.existsSync(path.join(root, 'data/workbench.sqlite'))) {
    // Use the last installed runtime for the pre-update backup when available.
    const old = settings.sourceRoot && path.join(settings.sourceRoot, 'local-dist/store.mjs');
    if (
      (!old || !fs.existsSync(old)) &&
      !fs.existsSync(path.join(source, 'local-dist/store.mjs'))
    ) {
      run(process.execPath, [path.join(source, 'scripts/build-local.mjs')]);
      built = true;
    }
    const mod =
      old && fs.existsSync(old) ? await import(pathToFileURL(old).href) : await storeModule();
    const store = new mod.LocalStore(root);
    try {
      console.log('更新前备份：' + store.backup('before-update'));
    } finally {
      store.close();
    }
  }
  if (!built) run(process.execPath, [path.join(source, 'scripts/build-local.mjs')]);
  fs.mkdirSync(root, { recursive: true });
  const { LocalStore } = await storeModule(),
    store = new LocalStore(root);
  try {
    store.load();
    store.loadDesktop();
  } finally {
    store.close();
  }
  const pending = configFile + '.' + randomUUID() + '.pending';
  fs.writeFileSync(
    pending,
    JSON.stringify(
      { ...settings, appId, sourceRoot: source, node: process.execPath, lockHash },
      null,
      2,
    ),
  );
  try {
    fs.renameSync(pending, configFile);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(pending, configFile);
    const fd = fs.openSync(configFile, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (!fs.readFileSync(pending).equals(fs.readFileSync(configFile)))
      throw new Error('本机配置落盘校验失败，数据目录保留。');
    fs.unlinkSync(pending);
  }
  if (!args.includes('--no-shortcut')) await shortcut();
  console.log('安装与数据库检查通过。');
  await start();
}
async function restore() {
  const from = value('--from');
  if (!from) throw new Error('请指定 --from "完整备份目录"。');
  if (!process.stdin.isTTY) throw new Error('恢复必须在交互终端确认，不接受自动确认参数。');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    '恢复将替换当前工作区。会先备份并保留现有数据。确认已保存需要保留的内容后，输入 RESTORE：',
  );
  rl.close();
  if (answer !== 'RESTORE') {
    console.log('已取消，数据未修改。');
    return;
  }
  await stop();
  await cleanupStaleLock(path.join(root, 'runtime/service.lock'));
  const lockFile = path.join(root, 'runtime/service.lock');
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const lock = fs.openSync(lockFile, 'wx');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, instance: 'restore' }));
  try {
    const { restoreBackup } = await storeModule();
    console.log('恢复完成：', restoreBackup(root, path.resolve(from)));
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
  }
  console.log('重新双击桌面快捷方式即可打开。');
}
try {
  if (command === 'install') await install();
  else if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'shortcut') await shortcut();
  else if (command === 'backup') await backup();
  else if (command === 'restore') await restore();
  else if (command === 'lan-enable') {
    const address = value('--address'),
      phone = value('--phone-address');
    if (!address || !phone)
      throw new Error(
        '请提供 --address 电脑IPv4 和 --phone-address 手机IPv4。也可双击 Connect-Phone.cmd 在设置中填写。',
      );
    await start();
    const result = await api('lan/config', {
      enabled: true,
      address,
      trustedAddresses: phone.split(',').map((ip) => ip.trim()),
    });
    console.log('手机浏览器地址：' + result.mobileUrl);
    console.log(
      '还需配置仅允许指定手机 IP 和专用网络的 Windows 防火墙规则；不会自动更改网络类别。',
    );
  } else if (command === 'lan-disable') {
    await start();
    await api('lan/config', { enabled: false });
    console.log('局域网入口已关闭，本地数据库保留。');
  } else if (command === 'lan-status') {
    const result = await api('lan/status', {}, 'GET');
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'lan-firewall') {
    const { configureFirewall } = await import('./lan-firewall.mjs');
    const { LanAccess } = await import(pathToFileURL(path.join(source, 'local-dist/lan.mjs')).href);
    const access = new LanAccess(root);
    if (!access.config.enabled && !args.includes('--remove'))
      throw new Error('请先通过 Connect-Phone.cmd 设置电脑和手机 IP。');
    if (!args.includes('--remove'))
      access.validate(access.config.address, access.config.trustedAddresses);
    await configureFirewall({
      address: access.config.address,
      phones: access.config.trustedAddresses,
      port: config().port,
      node: process.execPath,
      remove: args.includes('--remove'),
      checkOnly: args.includes('--check-only'),
    });
  } else throw new Error('可用命令：install / start / stop / shortcut / backup / restore');
} catch (e) {
  console.error('操作失败：' + e.message);
  console.error('原数据不会被自动清空。配置与日志目录：' + root);
  process.exitCode = 1;
}
