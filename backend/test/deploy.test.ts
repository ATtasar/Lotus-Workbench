import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { readFileSync } from 'node:fs';
describe('deployment network isolation', () => {
  it('parses Compose and publishes only the gateway, with persistent database and backups', () => {
    const document = parseDocument(readFileSync('../compose.yaml', 'utf8'));
    expect(document.errors).toEqual([]);
    const config = document.toJS();
    expect(config.services.db.ports).toBeUndefined();
    expect(config.services.api.ports).toBeUndefined();
    expect(config.services.web.ports).toEqual(['80:80', '443:443']);
    expect(config.networks.database.internal).toBe(true);
    expect(config.services.db.networks).toEqual(['database']);
    expect(config.services.db.volumes).toContain('pgdata:/var/lib/postgresql/data');
    expect(config.services.backup.volumes).toContain('./deploy/backups:/backups');
    expect(config.services.api.depends_on.db.condition).toBe('service_healthy');
  });
});
