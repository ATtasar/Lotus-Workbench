import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
export function ensureLocalFixture() {
  const root = path.resolve('artifacts/local-deployment-test'),
    file = path.join(root, 'data/workbench.sqlite');
  let ready = false;
  if (fs.existsSync(file)) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      ready = Number(db.prepare('SELECT COUNT(*) n FROM orders').get().n) > 0;
    } finally {
      db.close();
    }
  }
  if (!ready) {
    const r = spawnSync(process.execPath, ['tests/local-launcher.mjs'], {
      stdio: 'inherit',
      windowsHide: true,
    });
    if (r.status !== 0) throw new Error('无法生成隔离的浏览器测试夹具。');
  }
  return root;
}
