import type { Database } from './types';

export const collections = [
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
] as const;
export type Collection = (typeof collections)[number];
export interface Change {
  collection: Collection;
  id: string;
  remove?: true;
  values?: Record<string, unknown>;
}
export interface Changes {
  records: Change[];
  settings?: Database['settings'];
}
export function diffDatabase(before: Database, after: Database): Changes {
  const records: Change[] = [];
  for (const collection of collections) {
    const old = new Map(before[collection].map((r) => [r.id, r]));
    const next = new Set(after[collection].map((r) => r.id));
    for (const id of old.keys()) if (!next.has(id)) records.push({ collection, id, remove: true });
    for (const record of after[collection]) {
      const previous = old.get(record.id) as unknown as Record<string, unknown> | undefined;
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (!previous || JSON.stringify(previous[key]) !== JSON.stringify(value))
          values[key] = value;
      }
      if (Object.keys(values).length) records.push({ collection, id: record.id, values });
    }
  }
  return {
    records,
    ...(JSON.stringify(before.settings) === JSON.stringify(after.settings)
      ? {}
      : { settings: after.settings }),
  };
}
