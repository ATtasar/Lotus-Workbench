import type { Database } from './types';
import { validateDatabase } from './domain';
import { dateKey } from '../lib/date';

const DB_NAME = 'shijian-studio';
let opening: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('data');
      request.onerror = () => {
        opening = undefined;
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => {
        opening = undefined;
        reject(new Error('数据库升级被其他窗口阻挡，请关闭其他拾间页面后重试。'));
      };
    });
  return opening;
}
export const localRepository = {
  async load(): Promise<Database | null> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('data', 'readonly').objectStore('data').get('workspace');
      request.onsuccess = () => {
        try {
          resolve(request.result ? validateDatabase(request.result) : null);
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },
  async save(data: Database): Promise<void> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('data', 'readwrite');
      tx.objectStore('data').put(data, 'workspace');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('保存被中止'));
    });
  },
};
export async function readLocalValue<T>(key: string): Promise<T | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('data', 'readonly').objectStore('data').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
export async function writeLocalValue(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite');
    if (value === null) tx.objectStore('data').delete(key);
    else tx.objectStore('data').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export function downloadBackup(data: Database): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `拾间备份-${dateKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
