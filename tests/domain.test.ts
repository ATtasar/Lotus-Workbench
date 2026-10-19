import { describe, expect, it } from 'vitest';
import { addDays, dateKey, monthDays, shiftMonth } from '../src/lib/date';
import { seedDatabase, makeFolder, makeTask } from '../src/data/seed';
import {
  calendarEvents,
  canMoveFolder,
  deleteFolder,
  deleteOrder,
  folderPath,
  validateDatabase,
} from '../src/data/domain';

describe('文件夹与关联完整性', () => {
  it('支持深层嵌套，并拒绝自己、后代与不存在的移动目标', () => {
    const db = seedDatabase();
    let parent = db.folders[0].id;
    for (let n = 0; n < 24; n++) {
      const f = { ...makeFolder(parent), name: `第${n}层` };
      db.folders.push(f);
      parent = f.id;
    }
    expect(folderPath(db.folders, parent)).toHaveLength(25);
    expect(canMoveFolder(db.folders, db.folders[0].id, parent)).toBe(false);
    expect(canMoveFolder(db.folders, parent, parent)).toBe(false);
    expect(canMoveFolder(db.folders, parent, 'missing')).toBe(false);
    expect(canMoveFolder(db.folders, parent, db.folders[1].id)).toBe(true);
    expect(canMoveFolder(db.folders, parent, null)).toBe(true);
  });
  it('删除文件夹递归删除内容与关联，但不删除订单', () => {
    const db = seedDatabase();
    const result = deleteFolder(db, db.folders[0].id);
    expect(result.folders.map((f) => f.name)).toEqual(['日常器物']);
    expect(result.items.map((i) => i.name)).toEqual(['一枝青 · 小花器', '朱笺 · 灵感便签']);
    expect(result.links).toHaveLength(0);
    expect(result.orders).toEqual(db.orders);
  });
  it('删除订单删除其任务与关联，保留独立任务与物品', () => {
    const db = seedDatabase();
    const result = deleteOrder(db, db.orders[0].id);
    expect(result.tasks.some((t) => t.orderId === db.orders[0].id)).toBe(false);
    expect(result.tasks.some((t) => t.orderId === null)).toBe(true);
    expect(result.items).toEqual(db.items);
  });
});
describe('日期、日历与评分', () => {
  it('跨月和闰年日期保持准确', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonth('2024-03-31', -1)).toBe('2024-02-29');
    expect(monthDays('2026-10-19', 'monday')).toHaveLength(42);
  });
  it('任务修改会改变日历，订单同日多个时间字段不重复生成', () => {
    const db = seedDatabase();
    const order = db.orders[2];
    expect(
      calendarEvents(db).filter(
        (e) => e.source === 'order' && e.orderId === order.id && e.date === order.dueDate,
      ),
    ).toHaveLength(1);
    const task = db.tasks[0];
    const newDate = addDays(dateKey(), 15);
    db.tasks[0] = { ...task, date: newDate, done: true };
    const event = calendarEvents(db).find((e) => e.taskId === task.id);
    expect(event?.date).toBe(newDate);
    expect(event?.done).toBe(true);
    db.orders[0].archived = true;
    expect(calendarEvents(db).some((e) => e.orderId === db.orders[0].id)).toBe(true);
  });
  it('父文件夹、子文件夹和物品评分独立，空评分不默认赋值', () => {
    const db = seedDatabase();
    const parent = db.folders[0];
    parent.rating = 1;
    expect(db.folders[2].rating).toBe(4);
    expect(db.items[0].rating).toBe(5);
    expect(db.items[2].rating).toBeNull();
    expect(db.items[2].review).toBe('');
  });
});
describe('导入数据校验', () => {
  it('示例数据以及导出往返能通过校验', () => {
    const db = seedDatabase();
    expect(validateDatabase(JSON.parse(JSON.stringify(db)))).toEqual(db);
  });
  it.each([
    'cycle',
    'badDate',
    'badAmount',
    'missingParent',
    'duplicate',
    'missingLink',
    'emptySteps',
    'invalidReminder',
  ])('拒绝损坏备份：%s', (kind) => {
    const db = seedDatabase();
    if (kind === 'cycle') db.folders[0].parentId = db.folders[2].id;
    if (kind === 'badDate') db.orders[0].dueDate = '2026-02-30';
    if (kind === 'badAmount') db.orders[0].amount = -1;
    if (kind === 'missingParent') db.items[0].folderId = 'missing';
    if (kind === 'duplicate') db.items[0].id = db.orders[0].id;
    if (kind === 'missingLink') db.links[0].itemId = 'missing';
    if (kind === 'emptySteps') db.orders[0].steps = [''];
    if (kind === 'invalidReminder') db.tasks[0].reminder = { enabled: true, at: 'nope' };
    expect(() => validateDatabase(db)).toThrow();
  });
});
