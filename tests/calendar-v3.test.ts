import { describe, it, expect } from 'vitest';
import { seedDatabase, makeItem } from '../src/data/seed';
import {
  calendarEvents,
  calendarRecords,
  eventsForDate,
  ledgerSummary,
} from '../src/data/calendar';
import {
  feeAmount,
  feeIsValid,
  getPlatformColor,
  netAmount,
  removePlatform,
} from '../src/data/catalog';
import { entity, validateDatabase } from '../src/data/domain';
import { dateKey, addDays } from '../src/lib/date';

describe('日期、平台费用与收支', () => {
  it('删除平台选项保存最后选择的颜色到历史记录，不删除订单', () => {
    const db = seedDatabase();
    const p = db.platforms[0];
    p.color = '#aa3355';
    const next = removePlatform(db, p.id);
    expect(next.platforms.some((x) => x.id === p.id)).toBe(false);
    expect(next.orders).toHaveLength(db.orders.length);
    expect(calendarEvents(next).find((e) => e.orderId === db.orders[0].id)?.color).toBe('#aa3355');
    expect(validateDatabase(next)).toBe(next);
  });
  it('固定费用与百分比按分计算，拒绝负费用和超额费用', () => {
    expect(feeAmount(1000, 'percent', 10)).toBe(100);
    expect(netAmount(1000, 'percent', 10)).toBe(900);
    expect(netAmount(128, 'fixed', 5)).toBe(123);
    expect(netAmount(null, 'fixed', 0)).toBeNull();
    expect(feeIsValid(10, 'fixed', 11)).toBe(false);
    expect(feeIsValid(10, 'percent', 101)).toBe(false);
    expect(feeIsValid(10, 'fixed', -1)).toBe(false);
  });
  it('每笔订单和物品拥有开始、截止与中间排期标记，同日开始截止各自保留', () => {
    const db = seedDatabase();
    const o = db.orders[0];
    o.startDate = '2026-10-10';
    o.dueDate = '2026-10-12';
    expect(
      calendarEvents(db)
        .filter((e) => e.orderId === o.id && ['start', 'end'].includes(e.role || ''))
        .map((e) => e.date),
    ).toEqual(['2026-10-10', '2026-10-12']);
    expect(
      eventsForDate(db, '2026-10-11').some((e) => e.orderId === o.id && e.role === 'active'),
    ).toBe(true);
    o.dueDate = o.startDate;
    expect(
      calendarEvents(db).filter(
        (e) => e.source === 'order' && e.orderId === o.id && e.date === o.startDate,
      ),
    ).toHaveLength(2);
    expect(calendarRecords(db).some((r) => r.source === 'item')).toBe(true);
  });
  it('平台颜色变更同步历史记录，删除平台保留已存颜色', () => {
    const db = seedDatabase();
    const o = db.orders[0];
    o.platformColor = '#123456';
    const p = db.platforms.find((p) => p.name === o.platform)!;
    p.color = '#abcdef';
    expect(calendarEvents(db).find((e) => e.orderId === o.id)?.color).toBe('#abcdef');
    db.platforms = db.platforms.filter((x) => x.id !== p.id);
    expect(getPlatformColor(db, o.platform, o.platformColor)).toBe('#123456');
  });
  it('已付款收入扣除平台费，买卖物品关联订单后不重复统计', () => {
    const db = seedDatabase();
    const today = dateKey();
    db.items = [];
    db.orders = db.orders.slice(0, 1);
    const o = db.orders[0];
    Object.assign(o, {
      startDate: today,
      amount: 1000,
      payment: '已付全款',
      platformFeeMode: 'percent',
      platformFee: 10,
      cashFlow: 'income',
    });
    const i = {
      ...makeItem(),
      name: '已售作品',
      calendarEnabled: true,
      tradeKind: 'sale' as const,
      price: 1000,
    };
    db.items.push(i);
    db.links = [{ ...entity(), orderId: o.id, itemId: i.id }];
    expect(ledgerSummary(db, today, today)).toEqual({
      income: 900,
      expense: 0,
      balance: 900,
      count: 1,
    });
    db.links = [];
    expect(ledgerSummary(db, today, today).income).toBe(1900);
    o.payment = '未付款';
    expect(ledgerSummary(db, today, today).income).toBe(1000);
    o.payment = '已付定金';
    o.deposit = 200;
    expect(ledgerSummary(db, today, today).income).toBe(1180);
  });
  it('历史买卖和归档记录保留在日历中，平台筛选影响统计', () => {
    const db = seedDatabase();
    db.orders[0].archived = true;
    expect(calendarEvents(db).some((e) => e.orderId === db.orders[0].id)).toBe(true);
    const s = ledgerSummary(db, '2000-01-01', '2099-01-01', '不存在的平台');
    expect(s.count).toBe(0);
  });
  it('旧版本补齐档案字段、自定义选项与写入日，保留原数据', () => {
    const db = seedDatabase();
    const old = {
      ...db,
      version: 2,
      orders: db.orders.map((o) => ({ ...o, startDate: '' })),
      items: db.items.map((i) => ({ ...i, startDate: '' })),
    };
    const serialized = JSON.stringify(old);
    const migrated = validateDatabase(old);
    expect(migrated.version).toBe(3);
    expect(migrated.orders[0].startDate).toBe(dateKey(new Date(db.orders[0].createdAt)));
    expect(migrated.items[0].startDate).toBe(dateKey(new Date(db.items[0].createdAt)));
    expect(migrated.counterparties[0].requirements).toBe('');
    expect(migrated.orderTypes.length).toBeGreaterThan(0);
    expect(JSON.stringify(old)).toBe(serialized);
  });
  it('自定义订单类型可保存，损坏的颜色和平台费用不能导入', () => {
    const db = seedDatabase();
    db.orders[0].type = '3D模型';
    expect(validateDatabase(db)).toBe(db);
    db.platforms[0].color = 'red';
    expect(() => validateDatabase(db)).toThrow();
    db.platforms[0].color = '#123456';
    db.orders[0].platformFee = -5;
    expect(() => validateDatabase(db)).toThrow();
  });
});
