import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
for (const args of [['-b'], ['-p', 'tsconfig.local.json']]) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), ...args],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0) throw new Error('本地构建类型检查失败，原数据未修改。');
}
// Explicit values prevent an old cloud .env from activating remote APIs.
// Select the original desktop HTML/CSS/JS, never the 480px React phone shell.
// Copy a strict allowlist so private files and old bundles cannot be served.
const web = path.join(root, 'local-dist/web');
if (path.resolve(web) !== path.resolve(root, 'local-dist', 'web'))
  throw new Error('页面输出目录不正确，停止构建。');
await fs.rm(web, { recursive: true, force: true });
await fs.mkdir(web, { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'model.js', 'storage.js', 'api.js'])
  await fs.copyFile(path.join(root, 'desktop', name), path.join(web, name));
await fs.mkdir(path.join(web, 'mobile'), { recursive: true });
for (const name of ['index.html', 'mobile.css'])
  await fs.copyFile(path.join(root, 'mobile', name), path.join(web, 'mobile', name));
const core = await fs.readFile(path.join(root, 'desktop/app.js'), 'utf8');
const mobile = await fs.readFile(path.join(root, 'mobile/mobile.js'), 'utf8');
const point = core.lastIndexOf('  boot()');
if (point < 0) throw new Error('未找到共享稿件逻辑的启动位置，停止手机版构建。');
await fs.writeFile(path.join(web, 'mobile/app.js'),
  (core.slice(0, point) + '\n' + mobile + '\n' + core.slice(point))
    .replace("from './model.js'", "from '../model.js'")
    .replace("from './storage.js'", "from '../storage.js'"));
await build({
  configFile: false,
  ssr: { noExternal: true },
  build: {
    ssr: true,
    target: 'node24',
    outDir: 'local-dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        server: path.join(root, 'local/server.ts'),
        store: path.join(root, 'local/store.ts'),
        lan: path.join(root, 'local/lan.ts'),
      },
      output: { entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
    },
  },
});
await fs.writeFile(
  path.join(root, 'local-dist/build.json'),
  JSON.stringify(
    { mode: 'windows-local', ui: 'desktop-blank', createdAt: new Date().toISOString() },
    null,
    2,
  ),
);
console.log('本地版已构建到 local-dist；源码更新不会写入用户数据目录。');
