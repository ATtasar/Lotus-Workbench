import type { CalendarEvent, Database, Item, Order } from './types';
import { dateKey, monthDays, weekDays } from '../lib/date';
import { feeAmount, getPlatformColor } from './catalog';

export interface CalendarRecord {
  id: string;
  source: 'order' | 'item';
  name: string;
  start: string;
  end: string;
  platform: string;
  color: string;
  orderId: string | null;
  itemId?: string;
  done: boolean;
}
export function calendarRecords(db: Database): CalendarRecord[] {
  return [
    ...db.orders.map((o) => ({
      id: o.id,
      source: 'order' as const,
      name: o.name,
      start: o.startDate || dateKey(new Date(o.createdAt)),
      end: o.dueDate,
      platform: o.platform,
      color: getPlatformColor(db, o.platform, o.platformColor),
      orderId: o.id,
      done: o.status === '已完成',
    })),
    ...db.items
      .filter((i) => i.calendarEnabled)
      .map((i) => ({
        id: i.id,
        source: 'item' as const,
        name: i.name,
        start: i.startDate || dateKey(new Date(i.createdAt)),
        end: i.dueDate,
        platform: i.platform,
        color: getPlatformColor(db, i.platform, i.platformColor),
        orderId: db.links.find((l) => l.itemId === i.id)?.orderId || null,
        itemId: i.id,
        done: true,
      })),
  ];
}
export function calendarEvents(db: Database): CalendarEvent[] {
  const events: CalendarEvent[] = db.tasks.map((t) => {
    const order = db.orders.find((o) => o.id === t.orderId);
    return {
      id: `task-${t.id}`,
      name: t.name,
      date: t.date,
      time: t.time,
      done: t.done,
      source: 'task',
      role: 'task',
      orderId: t.orderId,
      taskId: t.id,
      reminder: t.reminder,
      platform: order?.platform || '',
      color: order ? getPlatformColor(db, order.platform, order.platformColor) : '#777777',
    };
  });
  for (const r of calendarRecords(db)) {
    const base = {
      source: r.source,
      orderId: r.orderId,
      itemId: r.itemId,
      platform: r.platform,
      color: r.color,
      time: '',
      done: r.done,
    };
    if (r.start)
      events.push({
        ...base,
        id: `${r.source}-${r.id}-start`,
        name: `${r.name} · 开始`,
        date: r.start,
        role: 'start',
      });
    if (r.end)
      events.push({
        ...base,
        id: `${r.source}-${r.id}-end`,
        name: `${r.name} · 约定截止`,
        date: r.end,
        role: 'end',
      });
  }
  for (const i of db.items.filter(
    (i) =>
      i.calendarEnabled &&
      i.tradeKind !== 'none' &&
      i.purchaseDate &&
      i.purchaseDate !== i.startDate &&
      i.purchaseDate !== i.dueDate,
  ))
    events.push({
      id: `item-${i.id}-purchase`,
      name: `${i.name} · ${i.tradeKind === 'sale' ? '售出' : '购买'}`,
      date: i.purchaseDate,
      time: '',
      done: true,
      source: 'item',
      role: 'milestone',
      itemId: i.id,
      orderId: db.links.find((l) => l.itemId === i.id)?.orderId || null,
      platform: i.platform,
      color: getPlatformColor(db, i.platform, i.platformColor),
    });
  for (const o of db.orders) {
    const dates = new Set([o.startDate, o.dueDate]);
    for (const [key, label] of [
      ['deliveryDate', '预计交付'],
      ['actualDeliveryDate', '实际交付'],
      ['shipDate', '发货'],
      ['receiveDate', '预计收货'],
      ['completedDate', '完成'],
    ] as const) {
      const date = o[key];
      if (!date || dates.has(date)) continue;
      dates.add(date);
      events.push({
        id: `order-${o.id}-${key}`,
        name: `${o.name} · ${label}`,
        date,
        time: '',
        done: o.status === '已完成',
        source: 'order',
        role: 'milestone',
        orderId: o.id,
        platform: o.platform,
        color: getPlatformColor(db, o.platform, o.platformColor),
      });
    }
  }
  return events
    .filter((e) => !!e.date)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
    );
}
export function eventsForDate(
  db: Database,
  date: string,
  scope: 'all' | 'orders' = 'all',
): CalendarEvent[] {
  const events = calendarEvents(db).filter(
    (e) => e.date === date && (scope === 'all' || e.source !== 'task' || !!e.orderId),
  );
  for (const r of calendarRecords(db))
    if (
      date > r.start &&
      !!r.end &&
      date < r.end &&
      !events.some(
        (e) =>
          e.source === r.source && (r.source === 'item' ? e.itemId === r.id : e.orderId === r.id),
      )
    ) {
      events.push({
        id: `${r.source}-${r.id}-active-${date}`,
        name: `${r.name} · 排期中`,
        date,
        time: '',
        done: r.done,
        source: r.source,
        role: 'active',
        orderId: r.orderId,
        itemId: r.itemId,
        platform: r.platform,
        color: r.color,
      });
    }
  return events;
}
export function periodDates(
  date: string,
  mode: 'month' | 'week' | 'day',
  start: 'monday' | 'sunday',
): [string, string] {
  if (mode === 'day') return [date, date];
  if (mode === 'week') {
    const days = weekDays(date, start);
    return [days[0], days[6]];
  }
  const first = `${date.slice(0, 7)}-01`;
  const d = new Date(`${first}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 0);
  return [first, dateKey(d)];
}
function paidGross(order: Order): number {
  if (order.refund !== '无退款') return 0;
  return order.payment === '已付全款'
    ? (order.amount ?? 0)
    : order.payment === '已付定金'
      ? (order.deposit ?? 0)
      : 0;
}
export function ledgerSummary(db: Database, from: string, to: string, platform = '') {
  let income = 0,
    expense = 0,
    count = 0;
  for (const o of db.orders) {
    const date = o.startDate || dateKey(new Date(o.createdAt));
    const gross = paidGross(o);
    if (
      date < from ||
      date > to ||
      (platform && platform !== o.platform) ||
      !gross ||
      o.cashFlow === 'none'
    )
      continue;
    if (o.cashFlow === 'income') {
      const fee = feeAmount(o.amount, o.platformFeeMode, o.platformFee);
      income += Math.max(
        0,
        gross -
          (o.amount
            ? (fee * gross) / o.amount
            : feeAmount(gross, o.platformFeeMode, o.platformFee)),
      );
    } else expense += gross;
    count++;
  }
  for (const i of db.items) {
    const date = i.startDate || dateKey(new Date(i.createdAt));
    if (
      !i.calendarEnabled ||
      i.tradeKind === 'none' ||
      i.price === null ||
      date < from ||
      date > to ||
      (platform && i.platform !== platform)
    )
      continue;
    const represented = db.links.some(
      (l) =>
        l.itemId === i.id &&
        db.orders.some(
          (o) =>
            o.id === l.orderId &&
            paidGross(o) > 0 &&
            o.cashFlow === (i.tradeKind === 'sale' ? 'income' : 'expense'),
        ),
    );
    if (represented) continue;
    if (i.tradeKind === 'sale') income += i.price;
    else expense += i.price;
    count++;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    income: round(income),
    expense: round(expense),
    balance: round(income - expense),
    count,
  };
}
