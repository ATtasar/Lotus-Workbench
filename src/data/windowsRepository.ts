import type { Database } from './types';
import { validateDatabase } from './domain';
import { localRepository } from './localRepository';
let token = '',
  revision = -1;
async function request<T>(endpoint: string, body?: unknown): Promise<T> {
  if (!token) {
    const response = await fetch('/local-api/session', {
      headers: { 'X-Lotus-Local': '1' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('本机服务不可用，请从桌面快捷方式重新打开。');
    token = (await response.json()).token;
  }
  const response = await fetch('/local-api/' + endpoint, {
    method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(120000),
    headers: {
      'X-Lotus-Local': '1',
      'X-Lotus-Token': token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '本机数据操作失败。');
  return result;
}
export const windowsRepository = {
  async load(): Promise<Database> {
    const result = await request<{ revision: number; data: Database }>('workspace');
    revision = result.revision;
    if (revision === 0) {
      const old = await localRepository.load();
      if (
        old &&
        window.confirm('检测到此网址原有浏览器数据。是否复制到电脑 SQLite？原浏览器数据会保留。')
      ) {
        await this.save(old);
        return old;
      }
    }
    return validateDatabase(result.data);
  },
  async save(data: Database): Promise<void> {
    if (revision < 0) throw new Error('本机数据尚未读取，已阻止覆盖。');
    const result = await request<{ revision: number }>('workspace', {
      baseRevision: revision,
      data,
    });
    revision = result.revision;
  },
};
export async function backupWindowsData() {
  return request<{ path: string }>('backup', {});
}
