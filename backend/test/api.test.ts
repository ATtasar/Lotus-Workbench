import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app';
import { readConfig } from '../src/config';
import { emptyDatabase } from '../src/workspace';
import { hashPassword } from '../src/password';
import { seedDatabase } from '../../src/data/seed';
import { diffDatabase } from '../../src/data/changeSet';
import type { Storage } from '../src/storage';
import type { Database } from '../../src/data/types';
describe('PostgreSQL API integration', () => {
  let db: PGlite, app: INestApplication, base: string, cookie: string, state: Database;
  const password = randomUUID() + randomUUID();
  let revision = 0;
  const origin = 'http://localhost:5173';
  const request = (path: string, body?: unknown, overrides: Record<string, string> = {}) =>
    fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        Cookie: cookie || '',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...overrides,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const storage = (): Storage => ({
    query: (sql, values) => db.query(sql, values) as any,
    transaction: (fn) =>
      db.transaction((tx) => fn({ query: (sql, values) => tx.query(sql, values) as any })),
    close: async () => {},
  });
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(readFileSync('src/schema.sql', 'utf8'));
    app = await createApplication(
      storage(),
      readConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'test-only',
        PUBLIC_ORIGIN: origin,
        ADMIN_USERNAME: 'creator',
        ADMIN_PASSWORD: password,
      }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });
  it('health probes work while workspace and session require authentication', async () => {
    expect((await request('/api/health/ready')).status).toBe(200);
    expect((await request('/api/workspace')).status).toBe(401);
    expect((await request('/api/auth/session')).status).toBe(401);
  });
  it('rejects wrong credentials and untrusted origins; uses HttpOnly sessions', async () => {
    expect(
      (await request('/api/auth/login', { username: 'creator', password: 'incorrect' })).status,
    ).toBe(401);
    expect(
      (
        await request(
          '/api/auth/login',
          { username: 'creator', password },
          { Origin: 'https://invalid.example' },
        )
      ).status,
    ).toBe(403);
    const response = await request('/api/auth/login', { username: 'creator', password });
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    cookie = response.headers.get('set-cookie')!.split(';')[0];
    const body = await response.json();
    expect(body.user.username).toBe('creator');
    expect(body.user.password_hash).toBeUndefined();
  });
  it('initializes an empty real workspace and excludes demonstration records', async () => {
    const body = await (await request('/api/workspace')).json();
    state = body.data;
    revision = body.revision;
    expect(state.orders).toEqual([]);
    expect(state.items).toEqual([]);
    expect(state.templates).toEqual([]);
  });
  it('persists complete linked business data and deduplicated binary attachments', async () => {
    const next = seedDatabase();
    const bytes = Buffer.from('test attachment');
    next.orders[0].attachments = [
      {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: 'note.txt',
        mime: 'text/plain',
        size: bytes.length,
        data: 'data:text/plain;base64,' + bytes.toString('base64'),
      },
    ];
    const payload = {
      baseRevision: revision,
      requestId: randomUUID(),
      changes: diffDatabase(state, next),
    };
    const response = await request('/api/workspace/changesets', payload);
    expect(await response.json()).toEqual({ revision: 1 });
    expect((await request('/api/workspace/changesets', payload)).status).toBe(201);
    const stored = await db.query<any>('SELECT data FROM studio_workspaces');
    expect(stored.rows[0].data.orders[0].attachments[0].data).toMatch(/^@file:/);
    expect((await db.query('SELECT hash FROM studio_files')).rows).toHaveLength(1);
    const loaded = await (await request('/api/workspace')).json();
    expect(loaded.data).toEqual(next);
    state = loaded.data;
    revision = loaded.revision;
    expect((await db.query('SELECT request_id FROM studio_mutations')).rows).toHaveLength(1);
  });
  it('rejects stale versions and reused submission identifiers with changed content', async () => {
    const next = structuredClone(state);
    next.orders[0].name = 'new name';
    const stale = await request('/api/workspace/changesets', {
      baseRevision: 0,
      requestId: randomUUID(),
      changes: diffDatabase(state, next),
    });
    expect(stale.status).toBe(409);
    expect((await (await request('/api/workspace')).json()).data).toEqual(state);
    const receipt = (await db.query<any>('SELECT request_id FROM studio_mutations')).rows[0]
      .request_id;
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: receipt,
          changes: { records: [] },
        })
      ).status,
    ).toBe(409);
  });
  it('sends only changed fields; keeps dates, ratings, links and files across reload', async () => {
    const next = structuredClone(state);
    next.orders[0].stage = 2;
    const changes = diffDatabase(state, next);
    expect(changes.records[0].values).toEqual({ stage: 2 });
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: randomUUID(),
          changes,
        })
      ).status,
    ).toBe(201);
    const loaded = await (await request('/api/workspace')).json();
    state = loaded.data;
    revision = loaded.revision;
    expect(state).toEqual(next);
    expect((await db.query('SELECT hash FROM studio_files')).rows).toHaveLength(1);
  });
  it('rolls back invalid folder cycles and dangling order/item links', async () => {
    const cycle = structuredClone(state);
    cycle.folders[0].parentId = cycle.folders[2].id;
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: randomUUID(),
          changes: diffDatabase(state, cycle),
        })
      ).status,
    ).toBe(400);
    const dangling = structuredClone(state);
    dangling.orders = [];
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: randomUUID(),
          changes: diffDatabase(state, dangling),
        })
      ).status,
    ).toBe(400);
    expect((await (await request('/api/workspace')).json()).revision).toBe(revision);
  });
  it('validates imported attachment size, count, content and field names', async () => {
    const invalid = structuredClone(state);
    invalid.orders[0].attachments[0].size = 1;
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: randomUUID(),
          changes: diffDatabase(state, invalid),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: randomUUID(),
          changes: { records: [{ collection: 'users', id: 'x', values: {} }] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: randomUUID(),
          changes: {
            records: [
              { collection: 'orders', id: state.orders[0].id, values: { password: 'invalid' } },
            ],
          },
        })
      ).status,
    ).toBe(400);
  });
  it('isolates accounts and prevents access to another workspace attachments', async () => {
    const id = randomUUID();
    await db.query('INSERT INTO studio_users(id,username,password_hash) VALUES($1,$2,$3)', [
      id,
      'second',
      await hashPassword(password),
    ]);
    await db.query('INSERT INTO studio_workspaces(user_id,data) VALUES($1,$2::jsonb)', [
      id,
      JSON.stringify(emptyDatabase('second')),
    ]);
    const login = await request('/api/auth/login', { username: 'second', password });
    const secondCookie = login.headers.get('set-cookie')!.split(';')[0];
    const second = await (
      await request('/api/workspace', undefined, { Cookie: secondCookie })
    ).json();
    expect(second.data.orders).toEqual([]);
    const copy = structuredClone(state);
    const internal = (
      await db.query<any>('SELECT data FROM studio_workspaces WHERE user_id<>$1', [id])
    ).rows[0].data;
    copy.orders[0].attachments = internal.orders[0].attachments;
    expect(
      (
        await request(
          '/api/workspace/changesets',
          { baseRevision: 0, requestId: randomUUID(), changes: diffDatabase(second.data, copy) },
          { Cookie: secondCookie },
        )
      ).status,
    ).toBe(400);
  });
  it('cleans unused files when clearing records and revokes logout sessions', async () => {
    const next = emptyDatabase('creator');
    expect(
      (
        await request('/api/workspace/changesets', {
          baseRevision: revision,
          requestId: randomUUID(),
          changes: diffDatabase(state, next),
        })
      ).status,
    ).toBe(201);
    expect((await db.query('SELECT hash FROM studio_files')).rows).toHaveLength(0);
    expect((await request('/api/auth/logout', {})).status).toBe(201);
    expect((await request('/api/workspace')).status).toBe(401);
  });
  it('blocks public login until production HTTPS is configured', async () => {
    const production = await createApplication(
      storage(),
      readConfig({ NODE_ENV: 'production', DATABASE_URL: 'test-only', ADMIN_USERNAME: 'creator' }),
    );
    try {
      await production.listen(0, '127.0.0.1');
      const url = await production.getUrl();
      const response = await fetch(url + '/api/auth/login', {
        method: 'POST',
        headers: { Origin: 'http://47.109.199.148', 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'creator', password }),
      });
      expect(response.status).toBe(503);
      expect((await fetch(url + '/api/health/ready')).status).toBe(200);
    } finally {
      await production.close();
    }
  });
  it('limits repeated failed logins without exposing password hashes', async () => {
    for (let n = 0; n < 10; n++)
      expect(
        (
          await request(
            '/api/auth/login',
            { username: 'creator', password: 'wrong' },
            { 'X-Forwarded-For': '203.0.113.12' },
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await request(
          '/api/auth/login',
          { username: 'creator', password: 'wrong' },
          { 'X-Forwarded-For': '203.0.113.12' },
        )
      ).status,
    ).toBe(429);
  });
});
