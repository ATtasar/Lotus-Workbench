import type { CalendarEvent, Database, Entity, Folder, OrderType } from './types';
import { validDate } from '../lib/date';
import { dateKey } from '../lib/date';
import { colorForName, defaultFlow, feeIsValid, PLATFORM_COLORS } from './catalog';
import { ORDER_TYPES } from './types';
export { calendarEvents } from './calendar';

// randomUUID is unavailable on phone previews served over an HTTP LAN address.
// getRandomValues is available in those contexts; IDs are local record keys.
export const uid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const entity = (): Entity => {
  const at = new Date().toISOString();
  return { id: uid(), createdAt: at, updatedAt: at };
};
export const stamp = <T extends Entity>(value: T): T => ({
  ...value,
  updatedAt: new Date().toISOString(),
});
export const reviewFields = () => ({ rating: null, review: '', pros: '', cons: '' });
export function stepsFor(type: OrderType): string[] {
  return type === '购买商品'
    ? ['待付款', '待发货', '运输中', '已收货']
    : type === '出售商品' || type === '手工定制'
      ? ['已确认', '制作中', '待发货', '已完成']
      : ['已确认', '绘制中', '待交付', '已完成'];
}
export function descendants(folders: Folder[], id: string): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders)
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        changed = true;
      }
  }
  return result;
}
export function canMoveFolder(folders: Folder[], id: string, target: string | null): boolean {
  return (
    folders.some((f) => f.id === id) &&
    (target === null ||
      (folders.some((f) => f.id === target) && !descendants(folders, id).has(target)))
  );
}
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const result: Folder[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const f = folders.find((x) => x.id === id);
    if (!f) break;
    result.unshift(f);
    id = f.parentId;
  }
  return result;
}
export function hiddenFolder(folders: Folder[], id: string | null): boolean {
  return folderPath(folders, id).some((f) => f.archived);
}
export function taskReminders(db: Database) {
  return db.tasks
    .filter(
      (t) =>
        !t.done &&
        t.reminder.enabled &&
        (!t.orderId || db.orders.some((o) => o.id === t.orderId && !o.archived)),
    )
    .sort((a, b) => a.reminder.at.localeCompare(b.reminder.at));
}
export function deleteOrder(db: Database, id: string): Database {
  return {
    ...db,
    orders: db.orders.filter((o) => o.id !== id),
    tasks: db.tasks.filter((t) => t.orderId !== id),
    links: db.links.filter((l) => l.orderId !== id),
    works: db.works.map((w) => (w.orderId === id ? stamp({ ...w, orderId: null }) : w)),
  };
}
export function deleteFolder(db: Database, id: string): Database {
  const removed = descendants(db.folders, id);
  const itemIds = new Set(
    db.items.filter((i) => i.folderId && removed.has(i.folderId)).map((i) => i.id),
  );
  return {
    ...db,
    folders: db.folders.filter((f) => !removed.has(f.id)),
    items: db.items.filter((i) => !itemIds.has(i.id)),
    links: db.links.filter((l) => !itemIds.has(l.itemId)),
  };
}
export function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
// Reject malformed backups before replacing any current records.
export function validateDatabase(value: unknown): Database {
  const fail = (): never => {
    throw new Error('备份格式无效：请导入拾间导出的完整 JSON 文件。');
  };
  if (!value || typeof value !== 'object') return fail();
  const input = value as Record<string, unknown>;
  // Version 1 backups and existing installations retain all original records.
  let d = value as Database;
  if (input.version === 1 && Array.isArray(input.orders)) {
    const counterparties: Database['counterparties'] = [];
    const orders = (input.orders as Database['orders']).map((o, index) => {
      if (!o || typeof o.party !== 'string' || typeof o.platform !== 'string') return o;
      let party = counterparties.find((p) => p.name === o.party && p.platform === o.platform);
      if (!party && o.party.trim()) {
        party = {
          ...entity(),
          requirements: '',
          preferences: '',
          avoidances: '',
          name: o.party,
          platform: o.platform,
          role: '交易对象',
          contact: o.contact || '',
          url: o.shopUrl || '',
          notes: '',
        };
        counterparties.push(party);
      }
      return { ...o, queuePosition: index, counterpartyId: party?.id || null };
    });
    d = {
      ...input,
      version: 2,
      orders,
      counterparties,
      templates: [],
      works: [],
    } as unknown as Database;
  }
  if (
    (d as { version: number }).version === 2 &&
    ['orders', 'items', 'templates', 'counterparties'].every((k) =>
      Array.isArray(d[k as keyof Database]),
    )
  ) {
    const names = [
      ...new Set(
        [
          ...ORDER_TYPES,
          ...d.orders.map((o) => o?.type),
          ...d.templates.map((t) => t?.type),
        ].filter((n) => typeof n === 'string' && n.trim()),
      ),
    ];
    const platforms = [
      ...new Set(
        [...d.orders, ...d.items, ...d.counterparties, ...d.templates]
          .map((r) => r?.platform)
          .filter((n) => typeof n === 'string' && n.trim()),
      ),
    ].map((name, index) => ({
      ...entity(),
      name,
      color: PLATFORM_COLORS[index % PLATFORM_COLORS.length],
    }));
    const fields = (r: { type: string; platform: string; createdAt: string }) => ({
      platformFeeMode: 'fixed' as const,
      platformFee: 0,
      platformColor:
        platforms.find((p) => p.name === r.platform)?.color || colorForName(r.platform),
      cashFlow: defaultFlow(r.type),
    });
    d = {
      ...d,
      version: 3,
      orderTypes: names.map((name) => ({ ...entity(), name })),
      platforms,
      orders: d.orders.map((o) =>
        o ? { ...o, ...fields(o), startDate: o.startDate || dateKey(new Date(o.createdAt)) } : o,
      ),
      templates: d.templates.map((t) =>
        t ? { ...t, ...fields(t), amount: null, startDate: '', dueDate: '' } : t,
      ),
      counterparties: d.counterparties.map((p) =>
        p ? { ...p, requirements: '', preferences: '', avoidances: '' } : p,
      ),
      items: d.items.map((i) =>
        i
          ? {
              ...i,
              calendarEnabled: !!(i.purchaseDate || (i.price !== null && i.price !== undefined)),
              tradeKind: 'purchase' as const,
              startDate: dateKey(new Date(i.createdAt)),
              dueDate: '',
              platformColor:
                platforms.find((p) => p.name === i.platform)?.color || colorForName(i.platform),
            }
          : i,
      ),
    };
  }
  if (
    d.version !== 3 ||
    !d.settings ||
    ![
      'orders',
      'tasks',
      'folders',
      'items',
      'links',
      'counterparties',
      'templates',
      'works',
      'orderTypes',
      'platforms',
    ].every((k) => Array.isArray(d[k as keyof Database]))
  )
    return fail();
  const records = [
    ...d.orders,
    ...d.tasks,
    ...d.folders,
    ...d.items,
    ...d.links,
    ...d.counterparties,
    ...d.templates,
    ...d.works,
    ...d.orderTypes,
    ...d.platforms,
    d.settings,
  ];
  const ids = new Set<string>();
  for (const r of records) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !r.id ||
      ids.has(r.id) ||
      typeof r.createdAt !== 'string' ||
      typeof r.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(r.createdAt)) ||
      !Number.isFinite(Date.parse(r.updatedAt))
    )
      fail();
    ids.add(r.id);
  }
  const textFields = (r: unknown, fields: string[]) =>
    !!r &&
    typeof r === 'object' &&
    fields.every((k) => typeof (r as Record<string, unknown>)[k] === 'string');
  const amount = (n: unknown) =>
    n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0);
  const tags = (a: unknown) => Array.isArray(a) && a.every((t) => typeof t === 'string');
  const attachments = (a: unknown) =>
    Array.isArray(a) &&
    a.every(
      (x) =>
        x &&
        textFields(x, ['id', 'name', 'mime', 'data', 'createdAt', 'updatedAt']) &&
        /^data:/.test(x.data) &&
        typeof x.size === 'number',
    );
  const review = (r: { rating: number | null }) =>
    (r.rating === null || (Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)) &&
    textFields(r, ['review', 'pros', 'cons']);
  if (
    !textFields(d.settings, ['name', 'bio']) ||
    !['monday', 'sunday'].includes(d.settings.weekStart) ||
    typeof d.settings.compact !== 'boolean' ||
    typeof d.settings.remindersEnabled !== 'boolean' ||
    ![0, 15, 30, 60, 1440].includes(d.settings.reminderMinutes)
  )
    fail();
  for (const o of d.orders) {
    if (
      typeof o.type !== 'string' ||
      !o.type.trim() ||
      !feeIsValid(o.amount, o.platformFeeMode, o.platformFee) ||
      !['income', 'expense', 'none'].includes(o.cashFlow) ||
      typeof o.platformColor !== 'string' ||
      (o.platformColor && !/^#[\da-f]{6}$/i.test(o.platformColor)) ||
      !Number.isFinite(o.queuePosition) ||
      (o.counterpartyId !== null && !d.counterparties.some((p) => p.id === o.counterpartyId)) ||
      !textFields(o, [
        'name',
        'customType',
        'number',
        'platform',
        'description',
        'party',
        'contact',
        'shopUrl',
        'communication',
        'payment',
        'refund',
        'notes',
        'links',
      ]) ||
      !o.name.trim() ||
      !['待处理', '进行中', '等待确认', '待交付', '已完成'].includes(o.status) ||
      typeof o.archived !== 'boolean' ||
      !Array.isArray(o.steps) ||
      o.steps.length < 2 ||
      !o.steps.every((s) => typeof s === 'string' && s) ||
      !Number.isInteger(o.stage) ||
      o.stage < 0 ||
      o.stage >= o.steps.length ||
      ![o.amount, o.deposit, o.balance].every(amount) ||
      !attachments(o.attachments) ||
      !Array.isArray(o.history) ||
      !o.history.every((h) => textFields(h, ['id', 'at', 'text']))
    )
      fail();
    for (const k of [
      'startDate',
      'dueDate',
      'deliveryDate',
      'actualDeliveryDate',
      'shipDate',
      'receiveDate',
      'completedDate',
    ] as const)
      if (!validDate(o[k])) fail();
  }
  for (const f of d.folders) {
    if (
      !textFields(f, [
        'name',
        'description',
        'purpose',
        'merchant',
        'shopUrl',
        'contact',
        'experience',
        'service',
        'packaging',
        'shipping',
      ]) ||
      !f.name.trim() ||
      !tags(f.tags) ||
      !review(f) ||
      !attachments(f.cover) ||
      typeof f.archived !== 'boolean'
    )
      fail();
    if (
      f.parentId !== null &&
      (!d.folders.some((x) => x.id === f.parentId) || !canMoveFolder(d.folders, f.id, f.parentId))
    )
      fail();
  }
  for (const i of d.items) {
    if (
      typeof i.calendarEnabled !== 'boolean' ||
      !['none', 'purchase', 'sale'].includes(i.tradeKind) ||
      !validDate(i.startDate) ||
      !validDate(i.dueDate) ||
      typeof i.platformColor !== 'string' ||
      (i.platformColor && !/^#[\da-f]{6}$/i.test(i.platformColor)) ||
      !textFields(i, [
        'name',
        'description',
        'spec',
        'merchant',
        'platform',
        'productUrl',
        'location',
        'notes',
        'experience',
        'illustration',
      ]) ||
      !i.name.trim() ||
      !tags(i.tags) ||
      !review(i) ||
      !attachments(i.attachments) ||
      !amount(i.price) ||
      !Number.isInteger(i.quantity) ||
      i.quantity < 1 ||
      typeof i.featured !== 'boolean' ||
      typeof i.archived !== 'boolean' ||
      !validDate(i.purchaseDate) ||
      (i.folderId !== null && !d.folders.some((f) => f.id === i.folderId))
    )
      fail();
    if (
      i.illustration &&
      !['/art/stationery.svg', '/art/vase.svg', '/art/notebook.svg'].includes(i.illustration)
    )
      fail();
  }
  for (const t of d.tasks) {
    if (
      !textFields(t, ['name', 'time', 'notes']) ||
      !t.name.trim() ||
      !validDate(t.date) ||
      !t.date ||
      (t.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time)) ||
      typeof t.done !== 'boolean' ||
      !Number.isFinite(t.position) ||
      (t.orderId !== null && !d.orders.some((o) => o.id === t.orderId)) ||
      !t.reminder ||
      typeof t.reminder.enabled !== 'boolean' ||
      typeof t.reminder.at !== 'string' ||
      (t.reminder.at &&
        (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(t.reminder.at) ||
          !validDate(t.reminder.at.slice(0, 10)))) ||
      (t.reminder.enabled && !t.reminder.at)
    )
      fail();
  }
  for (const p of d.counterparties) {
    if (
      !textFields(p, [
        'name',
        'platform',
        'role',
        'contact',
        'url',
        'notes',
        'requirements',
        'preferences',
        'avoidances',
      ]) ||
      !p.name.trim()
    )
      fail();
  }
  for (const t of d.templates) {
    if (
      typeof t.type !== 'string' ||
      !t.type.trim() ||
      !amount(t.amount) ||
      !feeIsValid(t.amount, t.platformFeeMode, t.platformFee) ||
      !['income', 'expense', 'none'].includes(t.cashFlow) ||
      typeof t.platformColor !== 'string' ||
      (t.platformColor && !/^#[\da-f]{6}$/i.test(t.platformColor)) ||
      !validDate(t.startDate) ||
      !validDate(t.dueDate) ||
      !textFields(t, ['name', 'customType', 'platform', 'description', 'notes']) ||
      !t.name.trim() ||
      !Number.isInteger(t.duration) ||
      t.duration < 0 ||
      t.duration > 3650 ||
      !Array.isArray(t.steps) ||
      t.steps.length < 2 ||
      !t.steps.every((s) => typeof s === 'string' && s.trim()) ||
      !Array.isArray(t.tasks) ||
      !t.tasks.every(
        (n) =>
          textFields(n, ['name']) &&
          n.name.trim() &&
          Number.isInteger(n.offset) &&
          n.offset >= 0 &&
          n.offset <= 3650,
      )
    )
      fail();
  }
  for (const w of d.works) {
    if (
      !textFields(w, ['name', 'description', 'illustration']) ||
      !w.name.trim() ||
      !['插画', '手作', '产品', '其他'].includes(w.category) ||
      !validDate(w.date) ||
      !tags(w.tags) ||
      !attachments(w.attachments) ||
      (w.orderId !== null && !d.orders.some((o) => o.id === w.orderId)) ||
      (w.illustration &&
        !['/art/stationery.svg', '/art/vase.svg', '/art/notebook.svg'].includes(w.illustration))
    )
      fail();
  }
  for (const options of [d.orderTypes, d.platforms]) {
    const seen = new Set<string>();
    for (const option of options) {
      if (
        !textFields(option, ['name']) ||
        !option.name.trim() ||
        seen.has(option.name.trim().toLowerCase())
      )
        fail();
      seen.add(option.name.trim().toLowerCase());
    }
  }
  for (const p of d.platforms) if (!/^#[\da-f]{6}$/i.test(p.color)) fail();
  const pairs = new Set<string>();
  for (const l of d.links) {
    const pair = `${l.orderId}/${l.itemId}`;
    if (
      !d.orders.some((o) => o.id === l.orderId) ||
      !d.items.some((i) => i.id === l.itemId) ||
      pairs.has(pair)
    )
      fail();
    pairs.add(pair);
  }
  if (d.orders.some((o) => !o.startDate) || d.items.some((i) => !i.startDate))
    return {
      ...d,
      orders: d.orders.map((o) =>
        o.startDate ? o : { ...o, startDate: dateKey(new Date(o.createdAt)) },
      ),
      items: d.items.map((i) =>
        i.startDate ? i : { ...i, startDate: dateKey(new Date(i.createdAt)) },
      ),
    };
  return d;
}
