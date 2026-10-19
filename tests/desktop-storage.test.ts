import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { LocalStore, restoreBackup } from '../local/store';
import { makeOrder } from '../src/data/seed';
import { initialData } from '../desktop/model.js';

const roots: string[] = [];
const open: LocalStore[] = [];
const temp = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lotus-desktop-test-'));
  roots.push(root);
  return root;
};
const storeAt = (root: string) => {
  const store = new LocalStore(root);
  open.push(store);
  return store;
};
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function fixture() {
  const data = initialData();
  data.platforms.push({ id: 'platform1', name: '测试平台', color: '#333333', fee: 5 });
  data.clients.push({
    id: 'client1',
    name: '单主',
    platforms: ['platform1'],
    preferences: '偏好',
    dislikes: '雷点',
    requirements: '要求',
    notes: '备注',
  });
  data.orders.push({
    id: 'order1',
    title: '电脑端稿件',
    platform: 'platform1',
    client: 'client1',
    category: '头像',
    deposit: 100,
    balance: 200,
    fee: 5,
    stages: ['未开始', '草稿', '成图', '完成'],
    status: '未开始',
    images: [png],
    extras: [{ name: '加急', amount: 30 }],
    start: '2026-10-19',
    due: '2026-10-20',
    paid: false,
    notes: '备注',
    requirements: '要求',
  });
  data.assets.push({ id: 'asset1', name: '素材', src: png });
  data.watermarkMark = png;
  data.current = 'order1';
  data.toolTemplates.push({
    id: 'layout1',
    name: '排版',
    kind: 'layout',
    layout: {
      width: 1000,
      height: 1000,
      bg: '#ffffff',
      items: [{ src: png, name: '图片', x: 10, y: 10, scale: 100, rotation: 0 }],
    },
  });
  return data;
}
afterEach(() => {
  for (const store of open.splice(0)) {
    try {
      store.close();
    } catch {}
  }
  for (const root of roots.splice(0)) {
    if (
      !path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'lotus-desktop-test-')
    )
      throw new Error('Unsafe cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it('persists original desktop records and deduplicated private images without altering mobile records', () => {
  const root = temp();
  let store = storeAt(root);
  expect(store.loadDesktop().data).toEqual(initialData());
  const mobile = store.load().data;
  mobile.orders.push({ ...makeOrder(), name: '保留的旧手机订单' });
  store.save(mobile, 0);
  const data = fixture();
  expect(store.saveDesktop(data, 0)).toBe(1);
  expect(fs.readdirSync(store.filesDir)).toHaveLength(1);
  const payloads = store.db.prepare('SELECT payload FROM desktop_records').all();
  expect(JSON.stringify(payloads)).toContain('@disk:');
  expect(JSON.stringify(payloads)).not.toContain('base64');
  store.close();
  store = storeAt(root);
  expect(store.loadDesktop()).toEqual({ revision: 1, data });
  expect(store.load().data).toEqual(mobile);
});
it('rejects invalid relationships and stale writes and rolls back interrupted desktop transactions', () => {
  const store = storeAt(temp());
  const data = fixture();
  store.saveDesktop(data, 0);
  expect(() => store.saveDesktop(data, 0)).toThrow(/其他窗口/);
  const bad = structuredClone(data);
  bad.orders[0].client = 'missing';
  expect(() => store.saveDesktop(bad, 1)).toThrow(/单主/);
  store.db.exec(
    "CREATE TRIGGER reject_desktop BEFORE INSERT ON desktop_records BEGIN SELECT RAISE(ABORT,'simulated disk error'); END",
  );
  const changed = structuredClone(data);
  changed.orders[0].title = '不应保存';
  expect(() => store.saveDesktop(changed, 1)).toThrow(/simulated/);
  expect(store.loadDesktop()).toEqual({ revision: 1, data });
});
it('backs up and restores both desktop and old mobile data with images and preserves pre-restore files', () => {
  const root = temp();
  const store = storeAt(root);
  const data = fixture();
  store.saveDesktop(data, 0);
  const backup = store.backup();
  const changed = structuredClone(data);
  changed.orders[0].title = '修改后';
  store.saveDesktop(changed, 1);
  store.close();
  const result = restoreBackup(root, backup);
  expect(fs.existsSync(result.preserved!)).toBe(true);
  expect(storeAt(root).loadDesktop().data).toEqual(data);
});
it('migrates schema 1 with a complete pre-migration backup and can restore schema 1 backups safely', () => {
  const root = temp();
  const store = storeAt(root);
  const data = store.load().data;
  data.orders.push({ ...makeOrder(), name: '迁移前订单' });
  store.save(data, 0);
  store.db.exec('DROP TABLE desktop_records; DROP TABLE desktop_workspace; PRAGMA user_version=1');
  const oldBackup = store.backup('old-schema');
  store.close();
  const migrated = storeAt(root);
  expect(migrated.load().data).toEqual(data);
  expect(migrated.loadDesktop().data).toEqual(initialData());
  expect((migrated.db.prepare('PRAGMA user_version').get() as any).user_version).toBe(2);
  expect(
    fs.readdirSync(path.join(root, 'backups')).some((n) => n.includes('before-desktop-migration')),
  ).toBe(true);
  migrated.close();
  restoreBackup(root, oldBackup);
  const restored = storeAt(root);
  expect(restored.load().data).toEqual(data);
  expect(restored.loadDesktop().data).toEqual(initialData());
});
it('keeps archived client associations and takes a complete backup before desktop deletion', () => {
  const root = temp();
  const store = storeAt(root);
  const data = fixture();
  store.saveDesktop(data, 0);
  data.archivedClients = data.clients;
  data.clients = [];
  store.saveDesktop(data, 1);
  expect(store.loadDesktop().data.orders[0].client).toBe('client1');
  const withoutOrder = structuredClone(data);
  withoutOrder.orders = [];
  withoutOrder.current = '';
  store.saveDesktop(withoutOrder, 2);
  expect(store.loadDesktop().data.assets).toHaveLength(1);
  expect(
    fs.readdirSync(path.join(root, 'backups')).some((n) => n.includes('before-desktop-change')),
  ).toBe(true);
});
it('refuses a future database version without changing saved desktop data', () => {
  const root = temp();
  const store = storeAt(root);
  store.saveDesktop(fixture(), 0);
  store.db.exec('PRAGMA user_version=99');
  store.close();
  expect(() => new LocalStore(root)).toThrow(/较新程序/);
  const db = new DatabaseSync(path.join(root, 'data/workbench.sqlite'), { readOnly: true });
  expect(
    (db.prepare("SELECT COUNT(*) n FROM desktop_records WHERE collection='orders'").get() as any).n,
  ).toBe(1);
  db.close();
});
