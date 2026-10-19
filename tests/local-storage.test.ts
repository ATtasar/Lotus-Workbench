import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { LocalStore, restoreBackup, emptyDatabase, APP_ID } from '../local/store';
import { serveLocal } from '../local/server';
import { entity, deleteOrder } from '../src/data/domain';
import { makeFolder, makeItem, makeOrder, makeTask } from '../src/data/seed';

const roots: string[] = [];
const stores: LocalStore[] = [];
function trackedStore(root: string) {
  const store = new LocalStore(root);
  stores.push(store);
  return store;
}
const temporary = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lotus-local-test-'));
  roots.push(dir);
  return dir;
};
afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      /* Already closed by the reopen test. */
    }
  }
  for (const dir of roots.splice(0)) {
    if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'lotus-local-test-'))
      throw new Error('Unsafe test cleanup path');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
function fixture() {
  const data = emptyDatabase();
  const folder = { ...makeFolder(), name: '一级', rating: 2, review: '一级评价' };
  const second = { ...makeFolder(folder.id), name: '二级', rating: 4, review: '二级评价' };
  const third = { ...makeFolder(second.id), name: '三级' };
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  const attachment = {
    ...entity(),
    name: '例图.png',
    mime: 'image/png',
    size: image.length,
    data: 'data:image/png;base64,' + image.toString('base64'),
  };
  const order = { ...makeOrder(), name: '本地订单', attachments: [attachment] };
  const item = {
    ...makeItem(third.id),
    name: '物品',
    rating: 5,
    review: '物品评价',
    attachments: [attachment],
  };
  data.folders = [folder, second, third];
  data.orders = [order];
  data.items = [item];
  data.tasks = [{ ...makeTask(undefined, order.id), name: '订单节点' }];
  data.links = [{ ...entity(), orderId: order.id, itemId: item.id }];
  return data;
}
describe('Windows SQLite persistence', () => {
  it('starts empty, persists nested folders, reviews, relationships and private image bytes across reopen', () => {
    const root = temporary();
    let store = trackedStore(root);
    expect(store.load().data.orders).toHaveLength(0);
    const data = fixture();
    expect(store.save(data, 0)).toBe(1);
    const payload = (store.db.prepare('SELECT payload FROM orders').get() as any).payload;
    expect(payload).toContain('@disk:');
    expect(payload).not.toContain('base64');
    expect(fs.readdirSync(store.filesDir)).toHaveLength(1);
    store.close();
    store = trackedStore(root);
    expect(store.load()).toEqual({ revision: 1, data });
    store.close();
  });
  it('rejects cycles, invalid associations and stale windows without modifying the committed snapshot', () => {
    const store = trackedStore(temporary());
    try {
      const data = fixture();
      store.save(data, 0);
      const cycle = structuredClone(data);
      cycle.folders[0].parentId = cycle.folders[2].id;
      expect(() => store.save(cycle, 1)).toThrow();
      const bad = structuredClone(data);
      bad.items[0].folderId = 'missing';
      expect(() => store.save(bad, 1)).toThrow();
      expect(() => store.save(data, 0)).toThrow(/其他窗口/);
      expect(store.load().data).toEqual(data);
    } finally {
      store.close();
    }
  });
  it('rolls back an interrupted SQLite write and safely maintains order deletion relationships', () => {
    const store = trackedStore(temporary());
    try {
      const data = fixture();
      store.save(data, 0);
      store.db.exec(
        "CREATE TRIGGER reject_update BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END",
      );
      const changed = structuredClone(data);
      changed.orders[0].name = '不应提交';
      expect(() => store.save(changed, 1)).toThrow(/simulated/);
      expect(store.load()).toEqual({ revision: 1, data });
      store.db.exec('DROP TRIGGER reject_update');
      const removed = deleteOrder(data, data.orders[0].id);
      store.save(removed, 1);
      expect(store.load().data.items).toHaveLength(1);
      expect(store.load().data.links).toHaveLength(0);
      expect(store.load().data.tasks).toHaveLength(0);
      expect(
        fs.readdirSync(path.join(store.root, 'backups')).some((n) => n.includes('before-change')),
      ).toBe(true);
    } finally {
      store.close();
    }
  });
  it('backs up real SQLite and attachments, restores with preservation, and rejects corrupt backup bytes', () => {
    const root = temporary(),
      store = trackedStore(root),
      data = fixture();
    store.save(data, 0);
    const backup = store.backup(),
      changed = structuredClone(data);
    changed.orders[0].name = '更新后的订单';
    store.save(changed, 1);
    store.close();
    const result = restoreBackup(root, backup);
    expect(result.before).toBeTruthy();
    expect(fs.existsSync(result.preserved!)).toBe(true);
    const restored = trackedStore(root);
    expect(restored.load().data).toEqual(data);
    restored.close();
    const id = fs.readdirSync(path.join(backup, 'files'))[0];
    fs.writeFileSync(path.join(backup, 'files', id), 'corrupt');
    expect(() => restoreBackup(root, backup)).toThrow(/摘要/);
    const unchanged = trackedStore(root);
    expect(unchanged.load().data).toEqual(data);
    unchanged.close();
  });
  it('refuses an unknown newer schema without resetting or deleting it', () => {
    const root = temporary(),
      store = trackedStore(root);
    store.save(fixture(), 0);
    store.db.exec('PRAGMA user_version=99');
    store.close();
    expect(() => trackedStore(root)).toThrow(/较新程序/);
    const db = new DatabaseSync(path.join(root, 'data/workbench.sqlite'));
    expect((db.prepare('SELECT COUNT(*) n FROM orders').get() as any).n).toBe(1);
    db.close();
  });
  it('recovers damaged active attachments while retaining the original data directory', () => {
    const root = temporary(),
      store = trackedStore(root),
      data = fixture();
    store.save(data, 0);
    const backup = store.backup();
    const file = fs.readdirSync(store.filesDir)[0];
    store.close();
    fs.unlinkSync(path.join(root, 'data/files', file));
    const result = restoreBackup(root, backup);
    expect(result.warning).toBeTruthy();
    expect(fs.existsSync(result.preserved!)).toBe(true);
    const repaired = trackedStore(root);
    expect(repaired.load().data).toEqual(data);
    repaired.close();
  });
  it('resumes an interrupted confirmed restore from its journal without deleting original data', () => {
    const root = temporary(),
      store = trackedStore(root),
      original = fixture();
    store.save(original, 0);
    const backup = store.backup();
    const changed = structuredClone(original);
    changed.orders[0].name = '恢复前的内容';
    store.save(changed, 1);
    store.close();
    const copy = fs.copyFileSync;
    const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation((from, to, mode) => {
      if (
        String(from).includes(path.sep + 'restore-') &&
        String(to) === path.join(root, 'data/workbench.sqlite')
      )
        throw new Error('simulated interruption');
      return copy(from, to, mode);
    });
    try {
      expect(() => restoreBackup(root, backup)).toThrow(/simulated interruption/);
    } finally {
      spy.mockRestore();
    }
    expect(fs.existsSync(path.join(root, 'restore-journal.json'))).toBe(true);
    const recovered = trackedStore(root);
    expect(recovered.load().data).toEqual(original);
    recovered.close();
    expect(fs.existsSync(path.join(root, 'restore-journal.json'))).toBe(false);
    expect(fs.readdirSync(root).some((name) => name.startsWith('preserved-data-'))).toBe(true);
  });
});
it('serves only loopback resources and rejects foreign origins, arbitrary paths and unauthenticated mutations', async () => {
  const root = temporary(),
    web = path.join(root, 'web');
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, 'index.html'), '<h1>本地页面</h1>');
  const port = 19863,
    service = await serveLocal({ root, web, port, instance: 'unit-test' }),
    base = `http://127.0.0.1:${port}`;
  try {
    expect(service.server.address()).toMatchObject({ address: '127.0.0.1' });
    expect((await (await fetch(base + '/local-api/health')).json()).appId).toBe(APP_ID);
    expect((await fetch(base + '/local-api/workspace')).status).toBe(403);
    expect(
      (
        await fetch(base + '/local-api/session', {
          headers: { 'X-Lotus-Local': '1', Origin: 'https://untrusted.example' },
        })
      ).status,
    ).toBe(403);
    expect((await fetch(base + '/.env')).status).toBe(403);
    expect((await fetch(base + '/backend/src/config.ts')).status).toBe(404);
    const { token } = await (
      await fetch(base + '/local-api/session', { headers: { 'X-Lotus-Local': '1' } })
    ).json();
    const response = await fetch(base + '/local-api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lotus-Local': '1', 'X-Lotus-Token': token },
      body: JSON.stringify({ data: fixture(), baseRevision: 0 }),
    });
    expect(response.status).toBe(200);
    expect(
      (
        await (
          await fetch(base + '/local-api/workspace', {
            headers: { 'X-Lotus-Local': '1', 'X-Lotus-Token': token },
          })
        ).json()
      ).data.folders,
    ).toHaveLength(3);
  } finally {
    const stopped = new Promise<void>((resolve) => service.server.once('close', resolve));
    service.close();
    await stopped;
  }
});
