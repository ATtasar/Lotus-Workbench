import type { CashFlow, Database, FeeMode } from './types';

export const PLATFORM_COLORS = [
  '#327A77',
  '#B65E73',
  '#5979A7',
  '#A77C3F',
  '#7863A1',
  '#568257',
  '#AC6647',
  '#587D8A',
];
export function colorForName(name: string): string {
  if (!name.trim()) return '#777777';
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return PLATFORM_COLORS[hash % PLATFORM_COLORS.length];
}
export function getPlatformColor(db: Database, name: string, snapshot = ''): string {
  return db.platforms.find((p) => p.name === name)?.color || snapshot || colorForName(name);
}
export function defaultFlow(type: string): CashFlow {
  return ['接稿', '出售商品', '手工定制'].includes(type)
    ? 'income'
    : ['约稿', '购买商品'].includes(type)
      ? 'expense'
      : 'none';
}
export function removePlatform(db: Database, id: string): Database {
  const p = db.platforms.find((p) => p.id === id);
  if (!p) return db;
  const snapshot = <T extends { platform: string; platformColor: string; updatedAt: string }>(
    r: T,
  ): T =>
    r.platform === p.name
      ? { ...r, platformColor: p.color, updatedAt: new Date().toISOString() }
      : r;
  return {
    ...db,
    platforms: db.platforms.filter((p) => p.id !== id),
    orders: db.orders.map(snapshot),
    items: db.items.map(snapshot),
    templates: db.templates.map(snapshot),
  };
}
export function feeAmount(amount: number | null, mode: FeeMode, value: number): number {
  if (amount === null) return 0;
  return Math.round((mode === 'percent' ? (amount * value) / 100 : value) * 100) / 100;
}
export function netAmount(amount: number | null, mode: FeeMode, value: number): number | null {
  return amount === null ? null : Math.round((amount - feeAmount(amount, mode, value)) * 100) / 100;
}
export function feeIsValid(amount: number | null, mode: FeeMode, value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    (mode === 'fixed' || mode === 'percent') &&
    (mode !== 'percent' || value <= 100) &&
    (amount === null || feeAmount(amount, mode, value) <= amount)
  );
}
