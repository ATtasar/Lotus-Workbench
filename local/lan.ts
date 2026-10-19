import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export interface LanDevice {
  id: string;
  name: string;
  address: string;
  hash: string;
  createdAt: string;
}
export interface LanConfig {
  version: 1;
  enabled: boolean;
  address: string;
  trustedAddresses: string[];
  devices: LanDevice[];
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function privateIPv4(value: string) {
  const parts = value.split('.');
  if (
    parts.length !== 4 ||
    parts.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255 || String(Number(x)) !== x)
  )
    return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
const numericIP = (value: string) =>
  value.split('.').reduce((a, n) => (a * 256 + Number(n)) >>> 0, 0);
export function lanInterfaces() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries || [])
      .filter((item) => item.family === 'IPv4' && !item.internal && privateIPv4(item.address))
      .map((item) => ({ name, address: item.address, netmask: item.netmask })),
  );
}
function sameSubnet(address: string, host: string, netmask: string) {
  const mask = numericIP(netmask),
    network = (numericIP(host) & mask) >>> 0;
  const broadcast = (network | ~mask) >>> 0,
    value = numericIP(address);
  return (value & mask) >>> 0 === network && value !== network && value !== broadcast;
}
function durableJSON(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const pending = file + '.' + randomUUID() + '.pending';
  const bytes = Buffer.from(JSON.stringify(value, null, 2));
  const fd = fs.openSync(pending, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    try {
      fs.renameSync(pending, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      fs.copyFileSync(pending, file);
      const saved = fs.openSync(file, 'r+');
      try {
        fs.fsyncSync(saved);
      } finally {
        fs.closeSync(saved);
      }
      if (!fs.readFileSync(file).equals(bytes)) throw new Error('手机联动配置落盘校验失败。');
    }
  } finally {
    if (fs.existsSync(pending)) fs.unlinkSync(pending);
  }
}
export class LanAccess {
  config: LanConfig;
  private code?: { hash: string; expires: number };
  private attempts = new Map<string, { count: number; until: number }>();
  private salt = randomBytes(32).toString('hex');
  readonly file: string;
  constructor(root: string) {
    this.file = path.join(root, 'lan-access.json');
    this.config = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, ''))
      : { version: 1, enabled: false, address: '', trustedAddresses: [], devices: [] };
    const c = this.config;
    if (
      c.version !== 1 ||
      typeof c.enabled !== 'boolean' ||
      typeof c.address !== 'string' ||
      !Array.isArray(c.trustedAddresses) ||
      c.trustedAddresses.length > 16 ||
      c.trustedAddresses.some((ip) => !privateIPv4(ip)) ||
      !Array.isArray(c.devices) ||
      c.devices.length > 32 ||
      c.devices.some(
        (d) =>
          !d ||
          !/^[a-f0-9-]{36}$/.test(d.id) ||
          typeof d.name !== 'string' ||
          d.name.length > 60 ||
          !privateIPv4(d.address) ||
          !/^[a-f0-9]{64}$/.test(d.hash) ||
          typeof d.createdAt !== 'string',
      )
    )
      throw new Error('手机联动配置损坏，已停止加载；请保留 lan-access.json，不会清空数据库。');
  }
  validate(address: unknown, trusted: unknown) {
    if (typeof address !== 'string' || !privateIPv4(address))
      throw new Error('请选择电脑现有的私网 IPv4 地址。');
    const adapter = lanInterfaces().find((item) => item.address === address);
    if (!adapter) throw new Error('电脑 IP 已变化，请重新选择当前网卡地址。');
    if (
      !Array.isArray(trusted) ||
      !trusted.length ||
      trusted.length > 16 ||
      trusted.some(
        (item) =>
          typeof item !== 'string' ||
          !privateIPv4(item) ||
          !sameSubnet(item, address, adapter.netmask),
      )
    )
      throw new Error(
        '请填写同一局域网中的手机 IPv4 地址，最多 16 个；不接受公网、整个网段或任意地址。',
      );
    return [...new Set(trusted)] as string[];
  }
  configure(enabled: boolean, address: unknown, trusted: unknown) {
    const addresses = enabled ? this.validate(address, trusted) : this.config.trustedAddresses;
    const next = {
      ...this.config,
      enabled,
      address: enabled ? String(address) : this.config.address,
      trustedAddresses: addresses,
    };
    durableJSON(this.file, next);
    this.config = next;
    this.code = undefined;
  }
  restore(config: LanConfig) {
    durableJSON(this.file, config);
    this.config = config;
    this.code = undefined;
  }
  allowed(address: string) {
    return this.config.enabled && this.config.trustedAddresses.includes(address);
  }
  issueCode() {
    if (!this.config.enabled) throw new Error('请先启用手机联动。');
    const code = String(randomInt(10000000, 100000000)),
      expires = Date.now() + 120000;
    this.code = { hash: digest(code), expires };
    return { code, expiresAt: new Date(expires).toISOString() };
  }
  pair(address: string, code: unknown, name: unknown) {
    if (!this.allowed(address)) throw new Error('当前设备 IP 不在允许列表内。');
    const now = Date.now(),
      previous = this.attempts.get(address);
    const attempt = previous && previous.until > now ? previous : { count: 0, until: now + 60000 };
    if (attempt.count >= 5)
      throw Object.assign(new Error('尝试次数过多，请一分钟后再试。'), { status: 429 });
    attempt.count++;
    this.attempts.set(address, attempt);
    if (
      typeof code !== 'string' ||
      !/^\d{8}$/.test(code) ||
      !this.code ||
      this.code.expires < now ||
      !timingSafeEqual(Buffer.from(this.code.hash, 'hex'), Buffer.from(digest(code), 'hex'))
    )
      throw Object.assign(new Error('配对码无效或已过期，请在电脑端重新生成。'), { status: 401 });
    if (this.config.devices.length >= 32)
      throw new Error('配对设备已满，请先在电脑端移除不用的设备。');
    const credential = randomBytes(32).toString('hex');
    const device = {
      id: randomUUID(),
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : '手机浏览器',
      address,
      hash: digest(credential),
      createdAt: new Date().toISOString(),
    };
    const next = { ...this.config, devices: [...this.config.devices, device] };
    durableJSON(this.file, next);
    this.config = next;
    this.code = undefined;
    return { credential, device };
  }
  authenticate(address: string, cookie = '') {
    if (!this.allowed(address)) return;
    const match = /(?:^|;\s*)LotusDevice=([a-f0-9]{64})(?:;|$)/.exec(cookie);
    if (!match) return;
    const hash = digest(match[1]);
    return this.config.devices.find(
      (item) =>
        item.address === address &&
        timingSafeEqual(Buffer.from(item.hash, 'hex'), Buffer.from(hash, 'hex')),
    );
  }
  csrf(device: LanDevice) {
    return digest(this.salt + device.hash);
  }
  revoke(id: unknown) {
    if (typeof id !== 'string' || !this.config.devices.some((item) => item.id === id))
      throw new Error('配对设备不存在。');
    const next = { ...this.config, devices: this.config.devices.filter((item) => item.id !== id) };
    durableJSON(this.file, next);
    this.config = next;
  }
  publicStatus() {
    return {
      ...this.config,
      devices: this.config.devices.map(({ hash: _hash, ...device }) => device),
      interfaces: lanInterfaces(),
    };
  }
}
