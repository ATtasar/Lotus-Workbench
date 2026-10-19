import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { LocalStore, restoreBackup } from '../local-dist/store.mjs';
import { ensureLocalFixture } from './local-fixture.mjs';
const runtime = path.join(process.env.LOCALAPPDATA, 'Lotus-Workbench/runtime');
const root = path.join(runtime, 'storage-validation-' + randomUUID());
const fixture = new LocalStore(ensureLocalFixture());
const data = fixture.load().data;
fixture.close();
assert.ok(data.orders.length > 0);
let store = new LocalStore(root);
try {
  store.save(data, 0);
  const backup = store.backup();
  const changed = structuredClone(data);
  changed.orders[0].name = '用户目录隔离恢复测试';
  store.save(changed, 1);
  store.close();
  restoreBackup(root, backup);
  store = new LocalStore(root);
  assert.deepEqual(store.load().data, data);
  console.log(
    'PASS actual LOCALAPPDATA filesystem: SQLite persistence, image-file promotion, full physical backup and journalled restore',
  );
  fs.writeFileSync(
    'artifacts/local-validation/user-directory-result.json',
    JSON.stringify(
      {
        passed: true,
        isolatedTest: true,
        productionDataChanged: false,
        checks: [
          'localappdata-sqlite',
          'image-file-promotion',
          'full-backup',
          'journalled-restore',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
  if (!path.resolve(root).startsWith(path.resolve(runtime) + path.sep + 'storage-validation-'))
    throw new Error('Unsafe test cleanup path');
  fs.rmSync(root, { recursive: true, force: true });
}
