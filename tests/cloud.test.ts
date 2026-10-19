import { describe, expect, it } from 'vitest';
import { validateApiBase } from '../src/lib/apiConfig';
import { diffDatabase } from '../src/data/changeSet';
import { seedDatabase } from '../src/data/seed';
describe('production API and incremental changes', () => {
  it('rejects local addresses, cleartext HTTP, embedded credentials and relative Android APIs', () => {
    for (const url of [
      'http://api.example.com/api',
      'https://localhost/api',
      'https://127.0.0.1/api',
      'https://192.168.1.1/api',
      'https://172.20.1.3/api',
      'https://10.0.0.2/api',
      'https://[::1]/api',
      'https://[fc00::1]/api',
      'https://[::ffff:127.0.0.1]/api',
      'https://user:password@api.example.com/api',
    ])
      expect(() => validateApiBase(url, true)).toThrow();
    expect(() => validateApiBase('/api', true, true)).toThrow();
    expect(validateApiBase('/api', true)).toBe('/api');
    expect(validateApiBase('https://api.example.com/api', true, true)).toBe(
      'https://api.example.com/api',
    );
  });
  it('preserves deletions, creation and settings changes without resending unchanged images', () => {
    const before = seedDatabase();
    const after = structuredClone(before);
    after.orders[0].name = 'changed';
    after.items.pop();
    after.settings.compact = true;
    const changes = diffDatabase(before, after);
    expect(changes.records.find((r) => r.collection === 'orders')?.values).toEqual({
      name: 'changed',
    });
    expect(changes.records.some((r) => r.collection === 'items' && r.remove)).toBe(true);
    expect(changes.settings?.compact).toBe(true);
    expect(diffDatabase(before, before)).toEqual({ records: [] });
  });
});
