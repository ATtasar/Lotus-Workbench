import type { Counterparty, Database, Order, OrderTemplate, Work } from './types';
import { entity, stamp, uid } from './domain';
import { makeOrder } from './seed';
import { addDays, dateKey } from '../lib/date';
import { defaultFlow } from './catalog';

export function makeCounterparty(): Counterparty {
  return {
    ...entity(),
    requirements: '',
    preferences: '',
    avoidances: '',
    name: '',
    platform: '',
    role: '委托方',
    contact: '',
    url: '',
    notes: '',
  };
}
export function makeTemplate(order?: Order): OrderTemplate {
  return {
    ...entity(),
    amount: order?.amount ?? null,
    platformFeeMode: order?.platformFeeMode || 'fixed',
    platformFee: order?.platformFee || 0,
    platformColor: order?.platformColor || '',
    cashFlow: order?.cashFlow || defaultFlow(order?.type || '接稿'),
    startDate: order?.startDate || '',
    dueDate: order?.dueDate || '',
    name: '',
    type: order?.type || '接稿',
    customType: order?.customType || '',
    platform: order?.platform || '',
    description: order?.description || '',
    notes: order?.notes || '',
    duration: 7,
    steps: order ? [...order.steps] : ['已确认', '绘制中', '待交付', '已完成'],
    tasks: [],
  };
}
export function makeWork(): Work {
  return {
    ...entity(),
    name: '',
    category: '插画',
    description: '',
    date: dateKey(),
    tags: [],
    attachments: [],
    illustration: '',
    orderId: null,
  };
}
export function orderFromTemplate(template: OrderTemplate): Order {
  const order = makeOrder(template.type);
  return {
    ...order,
    amount: template.amount,
    platformFeeMode: template.platformFeeMode,
    platformFee: template.platformFee,
    platformColor: template.platformColor,
    cashFlow: template.cashFlow,
    startDate: template.startDate || dateKey(),
    customType: template.customType,
    platform: template.platform,
    description: template.description,
    notes: template.notes,
    steps: [...template.steps],
    dueDate: template.dueDate || addDays(template.startDate || order.startDate, template.duration),
  };
}
export function attachCounterparty(order: Order, party: Counterparty): Order {
  return {
    ...order,
    counterpartyId: party.id,
    party: party.name,
    contact: party.contact,
    shopUrl: party.url,
    platform: order.platform || party.platform,
  };
}
export function moveQueue(db: Database, id: string, delta: number): Database {
  const queue = db.orders
    .filter((o) => !o.archived && o.status !== '已完成')
    .sort((a, b) => a.queuePosition - b.queuePosition || a.createdAt.localeCompare(b.createdAt));
  const index = queue.findIndex((o) => o.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= queue.length) return db;
  [queue[index], queue[next]] = [queue[next], queue[index]];
  const positions = new Map(queue.map((o, i) => [o.id, i]));
  return {
    ...db,
    orders: db.orders.map((o) =>
      positions.has(o.id) ? stamp({ ...o, queuePosition: positions.get(o.id)! }) : o,
    ),
  };
}
export function saveCounterparty(db: Database, party: Counterparty): Database {
  const exists = db.counterparties.some((p) => p.id === party.id);
  return {
    ...db,
    counterparties: exists
      ? db.counterparties.map((p) => (p.id === party.id ? stamp(party) : p))
      : [...db.counterparties, stamp(party)],
    orders: db.orders.map((o) =>
      o.counterpartyId === party.id
        ? stamp({ ...o, party: party.name, contact: party.contact, shopUrl: party.url })
        : o,
    ),
  };
}
export function deleteCounterparty(db: Database, id: string): Database {
  return {
    ...db,
    counterparties: db.counterparties.filter((p) => p.id !== id),
    orders: db.orders.map((o) =>
      o.counterpartyId === id ? stamp({ ...o, counterpartyId: null }) : o,
    ),
  };
}
export function historyEntry(text: string) {
  return { id: uid(), at: new Date().toISOString(), text };
}
