import { it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { LanAccess, lanInterfaces, privateIPv4 } from '../local/lan';
import { serveLocal } from '../local/server';
import { initialData, mergeBackup } from '../desktop/model.js';

const roots: string[] = [];
function temporary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lotus-lan-test-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'lotus-lan-test-'))
      throw new Error('Unsafe cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it('rejects wildcard, loopback, public, malformed and non-local listening addresses', () => {
  for (const ip of ['0.0.0.0', '127.0.0.1', '8.8.8.8', '192.168.001.2', '192.168.1.999', '::'])
    expect(privateIPv4(ip)).toBe(false);
  for (const ip of ['192.168.1.2', '10.1.2.3', '172.16.2.3']) expect(privateIPv4(ip)).toBe(true);
  const access = new LanAccess(temporary());
  expect(access.config.enabled).toBe(false);
  expect(() => access.validate('0.0.0.0', ['192.168.1.2'])).toThrow();
  expect(() => access.validate('192.168.254.254', ['192.168.1.2'])).toThrow(/IP 已变化/);
});
const adapter = lanInterfaces()[0];
it('safely merges old phone commissions with new IDs without overwriting PC records or breaking associations', () => {
  const pc = initialData();
  pc.profile.name = '电脑工作室';
  pc.platforms = [{ id: 'p1', name: '平台', color: '#333333', fee: 1 }];
  pc.clients = [
    {
      id: 'c1',
      name: '电脑单主',
      platforms: ['p1'],
      preferences: '',
      dislikes: '',
      requirements: '',
      notes: '',
    },
  ];
  pc.orders = [
    {
      id: 'o1',
      title: '电脑原稿件',
      platform: 'p1',
      client: 'c1',
      category: '头像',
      deposit: 10,
      balance: 20,
      fee: 0,
      stages: ['未开始', '成图', '完成'],
      status: '未开始',
      images: [],
      extras: [],
      start: '2026-10-19',
      due: '2026-10-20',
      paid: false,
      notes: '',
      requirements: '',
    },
  ];
  pc.current = 'o1';
  const oldPhone = structuredClone(pc);
  oldPhone.profile.name = '手机设置';
  oldPhone.clients[0].name = '手机单主';
  oldPhone.orders[0].title = '手机旧稿件';
  const result = mergeBackup(pc, oldPhone);
  expect(result.orders).toHaveLength(2);
  expect(result.orders[0]).toEqual(pc.orders[0]);
  expect(result.orders[1].id).not.toBe('o1');
  expect(result.clients.find((client) => client.id === result.orders[1].client)?.name).toBe(
    '手机单主',
  );
  expect(result.orders[1].platform).toBe('p1');
  expect(result.profile).toEqual(pc.profile);
  expect(result.current).toBe('o1');
  expect(pc.orders).toHaveLength(1);
  expect(oldPhone.orders[0].id).toBe('o1');
});
it.skipIf(!adapter)(
  'uses short-lived single-use pairing codes, rate limiting and hashed persistent device credentials',
  () => {
    const root = temporary(),
      access = new LanAccess(root);
    access.configure(true, adapter.address, [adapter.address]);
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const code = access.issueCode();
    now += 120001;
    expect(() => access.pair(adapter.address, code.code, '手机')).toThrow(/过期/);
    const fresh = access.issueCode();
    const paired = access.pair(adapter.address, fresh.code, '手机');
    expect(() => access.pair(adapter.address, fresh.code, '另一台')).toThrow(/过期/);
    expect(fs.readFileSync(access.file, 'utf8')).not.toContain(paired.credential);
    expect(JSON.stringify(access.publicStatus())).not.toContain(paired.device.hash);
    expect(
      new LanAccess(root).authenticate(adapter.address, 'LotusDevice=' + paired.credential)?.id,
    ).toBe(paired.device.id);
    expect(
      access.authenticate('192.168.254.254', 'LotusDevice=' + paired.credential),
    ).toBeUndefined();
    access.revoke(paired.device.id);
    expect(
      access.authenticate(adapter.address, 'LotusDevice=' + paired.credential),
    ).toBeUndefined();
    now += 61000;
    for (let i = 0; i < 5; i++)
      expect(() => access.pair(adapter.address, '00000000', '手机')).toThrow(/过期/);
    expect(() => access.pair(adapter.address, access.issueCode().code, '手机')).toThrow(/次数/);
  },
);
it.skipIf(!adapter)(
  'shares the existing SQLite instance across authenticated local and LAN APIs, rejects conflicts and keeps LAN administration local-only',
  async () => {
    const root = temporary(),
      port = 19864;
    const local = `http://127.0.0.1:${port}`,
      remote = `http://${adapter.address}:${port}`;
    let service = await serveLocal({
      root,
      web: path.resolve('local-dist/web'),
      port,
      instance: 'lan-api-test',
    });
    const stop = async () => {
      const closed = once(service.server, 'close');
      service.close();
      await closed;
    };
    let pcToken = '';
    const pc = async (endpoint: string, body?: unknown) => {
      const result = await fetch(local + '/local-api/' + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Connection: 'close',
          'X-Lotus-Local': '1',
          'X-Lotus-Token': pcToken,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: result.status, value: await result.json() };
    };
    let cookie = '',
      phoneToken = '';
    const phone = async (endpoint: string, body?: unknown, extra: Record<string, string> = {}) =>
      fetch(remote + '/local-api/' + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Connection: 'close',
          Origin: remote,
          'X-Lotus-Local': '1',
          Cookie: cookie,
          'X-Lotus-Token': phoneToken,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      pcToken = (await pc('session')).value.token;
      expect(service.server.address()).toMatchObject({ address: '127.0.0.1' });
      expect(service.lanStatus().active).toBe(false);
      expect(
        (
          await pc('lan/config', {
            enabled: true,
            address: adapter.address,
            trustedAddresses: ['8.8.8.8'],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await pc('lan/config', {
            enabled: true,
            address: adapter.address,
            trustedAddresses: [adapter.address],
          })
        ).value.active,
      ).toBe(true);
      expect((await phone('desktop-workspace')).status).toBe(401);
      expect(
        (await phone('session', undefined, { Origin: 'https://untrusted.example' })).status,
      ).toBe(403);
      const pairCode = (await pc('lan/code', {})).value.code;
      const paired = await phone('lan/pair', { code: pairCode, name: '测试手机' });
      expect(paired.status).toBe(200);
      expect(paired.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
      cookie = paired.headers.get('set-cookie')!.split(';')[0];
      phoneToken = (await (await phone('session')).json()).token;
      expect(phoneToken).not.toBe(pcToken);
      for (const endpoint of ['stop', 'lan/code', 'lan/revoke', 'workspace'])
        expect((await phone(endpoint, {})).status).toBe(403);
      expect((await phone('desktop-workspace', {}, { 'X-Lotus-Token': pcToken })).status).toBe(403);
      expect((await fetch(remote + '/runtime-config.js')).status).toBe(200);
      expect(await (await fetch(remote + '/runtime-config.js')).text()).toContain(
        '"localAccess":false',
      );
      expect((await fetch(remote + '/data/workbench.sqlite')).status).toBe(404);
      const data = initialData();
      data.platforms = [{ id: 'p1', name: '平台', color: '#333333', fee: 0 }];
      data.clients = [
        {
          id: 'c1',
          name: '单主',
          platforms: ['p1'],
          preferences: '',
          dislikes: '',
          requirements: '',
          notes: '',
        },
      ];
      data.orders = [
        {
          id: 'o1',
          title: '手机新增稿件',
          platform: 'p1',
          client: 'c1',
          category: '头像',
          deposit: 10,
          balance: 20,
          fee: 0,
          stages: ['未开始', '成图', '完成'],
          status: '未开始',
          images: [
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          ],
          extras: [],
          start: '2026-10-19',
          due: '2026-10-20',
          paid: false,
          notes: '',
          requirements: '',
        },
      ];
      data.current = 'o1';
      expect((await phone('desktop-workspace', { data, baseRevision: 0 })).status).toBe(200);
      const desktop = (await pc('desktop-workspace')).value;
      expect(desktop.data.orders[0].title).toBe('手机新增稿件');
      expect(fs.readdirSync(path.join(root, 'data/files'))).toHaveLength(1);
      const stale = structuredClone(desktop);
      desktop.data.orders[0].title = '电脑修改稿件';
      expect(
        (await pc('desktop-workspace', { data: desktop.data, baseRevision: desktop.revision }))
          .status,
      ).toBe(200);
      stale.data.orders[0].title = '过期手机修改';
      expect(
        (await phone('desktop-workspace', { data: stale.data, baseRevision: stale.revision }))
          .status,
      ).toBe(409);
      expect((await (await phone('desktop-workspace')).json()).data.orders[0].title).toBe(
        '电脑修改稿件',
      );
      const revision = (await (await phone('revision')).json()).revision;
      expect(revision).toBe(2);
      const device = (await pc('lan/status')).value.devices[0];
      expect((await pc('lan/revoke', { id: device.id })).status).toBe(200);
      expect((await phone('desktop-workspace')).status).toBe(401);
      const secondCode = (await pc('lan/code', {})).value.code;
      const second = await phone('lan/pair', { code: secondCode, name: '重新配对' });
      cookie = second.headers.get('set-cookie')!.split(';')[0];
      await stop();
      service = await serveLocal({
        root,
        web: path.resolve('local-dist/web'),
        port,
        instance: 'lan-api-restart',
      });
      phoneToken = (await (await phone('session')).json()).token;
      expect((await (await phone('desktop-workspace')).json()).data.orders[0].title).toBe(
        '电脑修改稿件',
      );
      pcToken = (await pc('session')).value.token;
      expect((await pc('lan/config', { enabled: false })).status).toBe(200);
      expect(service.lanStatus().active).toBe(false);
    } finally {
      await stop();
    }
  },
);
