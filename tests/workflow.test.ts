import { describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/data/seed';
import { deleteOrder, validateDatabase } from '../src/data/domain';
import {
  deleteCounterparty,
  moveQueue,
  orderFromTemplate,
  saveCounterparty,
} from '../src/data/workflow';
import { addDays } from '../src/lib/date';

describe('订单工作区', () => {
  it('迁移旧版数据时保留所有订单、任务、图片和物品关联', () => {
    const db = seedDatabase();
    const { counterparties, templates, works, ...base } = db;
    const legacy = {
      ...base,
      version: 1,
      orders: db.orders.map(({ queuePosition, counterpartyId, ...order }) => order),
    };
    const migrated = validateDatabase(JSON.parse(JSON.stringify(legacy)));
    expect(migrated.version).toBe(3);
    expect(migrated.orders.map((o) => o.id)).toEqual(db.orders.map((o) => o.id));
    expect(migrated.tasks).toEqual(db.tasks);
    expect(migrated.items.map((i) => [i.id, i.attachments, i.price, i.folderId])).toEqual(
      db.items.map((i) => [i.id, i.attachments, i.price, i.folderId]),
    );
    expect(migrated.links).toEqual(db.links);
    expect(migrated.counterparties).toHaveLength(3);
    expect(
      migrated.orders.every((o) =>
        migrated.counterparties.some((p) => p.id === o.counterpartyId && p.name === o.party),
      ),
    ).toBe(true);
    expect(migrated.templates).toEqual([]);
    expect(migrated.works).toEqual([]);
    expect(validateDatabase(migrated)).toEqual(migrated);
  });
  it('调整排单顺序保持 ID、任务和关联不变，边界移动不生效', () => {
    const db = seedDatabase();
    const first = db.orders[0];
    expect(moveQueue(db, first.id, -1)).toBe(db);
    const next = moveQueue(db, first.id, 1);
    expect(
      [...next.orders].sort((a, b) => a.queuePosition - b.queuePosition).map((o) => o.id),
    ).toEqual([db.orders[1].id, first.id, db.orders[2].id]);
    expect(next.tasks).toEqual(db.tasks);
    expect(next.links).toEqual(db.links);
    expect(validateDatabase(next)).toBe(next);
  });
  it('模板复制流程和工期，不共享可变数组或交易对象', () => {
    const db = seedDatabase();
    const t = db.templates[0];
    const order = orderFromTemplate(t);
    expect(order.dueDate).toBe(addDays(order.startDate, t.duration));
    expect(order.steps).toEqual(t.steps);
    expect(order.steps).not.toBe(t.steps);
    expect(order.counterpartyId).toBeNull();
    expect(order.name).toBe('');
    order.steps[0] = '修改';
    expect(t.steps[0]).toBe('已确认');
  });
  it('修改对象更新关联资料，删除对象保留历史订单资料', () => {
    const db = seedDatabase();
    const p = { ...db.counterparties[0], name: '更新名称', contact: '新联系方式' };
    const updated = saveCounterparty(db, p);
    expect(updated.orders[0].party).toBe(p.name);
    expect(updated.orders[0].contact).toBe(p.contact);
    const removed = deleteCounterparty(updated, p.id);
    expect(removed.orders[0].counterpartyId).toBeNull();
    expect(removed.orders[0].party).toBe(p.name);
    expect(removed.orders).toHaveLength(db.orders.length);
    expect(validateDatabase(removed)).toBe(removed);
  });
  it('删除订单仅解除作品关联，保留作品与图片', () => {
    const db = seedDatabase();
    const work = db.works.find((w) => w.orderId)!;
    const next = deleteOrder(db, work.orderId!);
    expect(next.works.find((w) => w.id === work.id)?.orderId).toBeNull();
    expect(next.works).toHaveLength(db.works.length);
    expect(validateDatabase(next)).toBe(next);
  });
  it.each(['partyReference', 'taskOffset', 'workReference', 'emptySteps'])(
    '拒绝损坏的新模块备份：%s',
    (kind) => {
      const db = seedDatabase();
      if (kind === 'partyReference') db.orders[0].counterpartyId = 'missing';
      if (kind === 'taskOffset') db.templates[0].tasks[0].offset = -1;
      if (kind === 'workReference') db.works[0].orderId = 'missing';
      if (kind === 'emptySteps') db.templates[0].steps = [''];
      expect(() => validateDatabase(db)).toThrow('备份格式无效');
    },
  );
});
