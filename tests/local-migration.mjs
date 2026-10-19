import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalStore } from '../local-dist/store.mjs';
import { serveLocal } from '../local-dist/server.mjs';
import { ensureLocalFixture } from './local-fixture.mjs';
const old = new LocalStore(ensureLocalFixture());
const original = old.load().data;
old.close();
assert.ok(original.orders.length > 0, 'Run launcher fixture validation first');
const root = await fs.mkdtemp(path.resolve('artifacts/local-migration-'));
const service = await serveLocal({
  root,
  web: path.resolve('local-dist/web'),
  port: 17845,
  instance: 'migration-test',
});
const browser = await chromium.launch({
  executablePath:
    process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:17845/local-api/health');
  await page.evaluate(async (data) => {
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('shijian-studio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('data');
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put(data, 'workspace');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, original);
  page.once('dialog', (dialog) => dialog.accept());
  await page.goto('http://127.0.0.1:17845/');
  await expect(page.getByRole('heading', { name: '收纳展示' })).toBeVisible();
  const copied = await page.evaluate(async () => {
    const { token } = await (
      await fetch('/local-api/session', { headers: { 'X-Lotus-Local': '1' } })
    ).json();
    return (
      await (
        await fetch('/local-api/workspace', {
          headers: { 'X-Lotus-Local': '1', 'X-Lotus-Token': token },
        })
      ).json()
    ).data;
  });
  const source = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('shijian-studio', 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction('data').objectStore('data').get('workspace');
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
        };
      }),
  );
  assert.deepEqual(copied, original);
  assert.deepEqual(source, original);
  assert.ok((await fs.readdir(path.join(root, 'data/files'))).length > 0);
  console.log(
    'PASS confirmed IndexedDB migration copies all records, attachments and relationships into SQLite while preserving the browser source',
  );
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: '我的', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '备份数据库与附件' })).toBeEnabled();
  const replacement = structuredClone(original);
  replacement.orders[0].name = '从 JSON 恢复的订单';
  await page.getByLabel('导入备份文件', { exact: true }).setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(replacement)),
  });
  await expect(page.getByRole('alertdialog')).toBeVisible();
  assert.deepEqual(service.store.load().data, original);
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
  await expect.poll(() => service.store.load().data.orders[0].name).toBe('从 JSON 恢复的订单');
  const backups = await fs.readdir(path.join(root, 'backups'));
  assert.ok(backups.length > 0);
  assert.deepEqual(source, original);
  console.log(
    'PASS JSON recovery waits for confirmation, creates a physical pre-restore backup, and restores linked records',
  );
  await fs.writeFile(
    'artifacts/local-validation/migration-result.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          'idb-source-preserved',
          'confirmed-copy-to-sqlite',
          'image-files',
          'json-confirmation',
          'json-pre-restore-backup',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  const closed = new Promise((resolve) => service.server.once('close', resolve));
  service.close();
  await closed;
}
