// The desktop UI talks only to the loopback service. Browser storage is read
// solely for a confirmed migration; it is never the primary data store.
import { validateBackup } from './model.js';
let token;
let revision;
let blocked = false;
async function request(endpoint, body) {
  if (!token) {
    const session = await fetch('/local-api/session', {
      headers: { 'X-Lotus-Local': '1' },
      signal: AbortSignal.timeout(10000),
    });
    if (!session.ok) throw new Error('无法连接本机服务，请从桌面快捷方式重新打开工作台。');
    token = (await session.json()).token;
  }
  const response = await fetch('/local-api/' + endpoint, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'X-Lotus-Local': '1',
      'X-Lotus-Token': token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '本机数据操作失败。');
  return result;
}
export const storage = {
  async load() {
    const result = await request('desktop-workspace');
    revision = result.revision;
    return validateBackup(result.data);
  },
  async save(data) {
    if (blocked) throw new Error('前次保存失败。请先导出备份，再刷新页面；不会覆盖磁盘记录。');
    try {
      const result = await request('desktop-workspace', { data, baseRevision: revision });
      revision = result.revision;
    } catch (error) {
      blocked = true;
      throw error;
    }
  },
  async backup() {
    return (await request('backup', {})).path;
  },
  async legacy() {
    // databases() avoids creating empty legacy databases on every launch.
    if (indexedDB.databases) {
      const names = await indexedDB.databases();
      if (names.some((db) => db.name === 'still-commission-workbench-blank-v1')) {
        const value = await new Promise((resolve, reject) => {
          const open = indexedDB.open('still-commission-workbench-blank-v1');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('state')) {
              db.close();
              resolve(null);
              return;
            }
            const read = db.transaction('state').objectStore('state').get('workspace');
            read.onsuccess = () => {
              db.close();
              resolve(read.result || null);
            };
            read.onerror = () => {
              db.close();
              reject(read.error);
            };
          };
        });
        if (value) return validateBackup(value);
      }
    }
    const text = localStorage.getItem('still-workbench-blank-v1');
    return text ? validateBackup(JSON.parse(text)) : null;
  },
};
