import type { Database } from './types';
import { diffDatabase } from './changeSet';
import { validateDatabase, uid } from './domain';
import { apiRequest } from '../lib/api';
import { downloadBackup, readLocalValue, writeLocalValue } from './localRepository';
interface Draft {
  baseRevision: number;
  data: Database;
}
let userId = '';
let revision = 0;
let snapshot: Database | null = null;
let desired: Database | null = null;
let draftWrites = Promise.resolve();
let pending: {
  body: { baseRevision: number; requestId: string; changes: ReturnType<typeof diffDatabase> };
  target: Database;
} | null = null;
const draftKey = () => `cloud-draft:${userId}`;
export function setCloudUser(id: string) {
  userId = id;
  snapshot = null;
  desired = null;
  pending = null;
}
function persistDraft() {
  const key = draftKey();
  const value =
    desired && (pending || !snapshot || JSON.stringify(desired) !== JSON.stringify(snapshot))
      ? ({ baseRevision: revision, data: structuredClone(desired) } satisfies Draft)
      : null;
  draftWrites = draftWrites.catch(() => {}).then(() => writeLocalValue(key, value));
  return draftWrites;
}
export function stageCloudDraft(data: Database) {
  desired = structuredClone(data);
  return persistDraft();
}
export async function exportCloudDraft() {
  const draft = await readLocalValue<Draft>(draftKey());
  if (draft) downloadBackup(validateDatabase(draft.data));
}
export async function discardCloudDraft() {
  await draftWrites.catch(() => {});
  await writeLocalValue(draftKey(), null);
  pending = null;
  desired = null;
}
export const remoteRepository = {
  async load(): Promise<Database> {
    const response = await apiRequest<{ revision: number; data: Database }>('/workspace');
    snapshot = validateDatabase(response.data);
    revision = response.revision;
    pending = null;
    const draft = await readLocalValue<Draft>(draftKey());
    if (draft) {
      const desired = validateDatabase(draft.data);
      if (JSON.stringify(desired) === JSON.stringify(snapshot)) await discardCloudDraft();
      else if (draft.baseRevision === revision) return desired;
      else
        throw new Error('云端版本已变化，当前浏览器还有未提交草稿。请先导出草稿，再选择读取云端。');
    }
    return snapshot;
  },
  async save(data: Database): Promise<void> {
    if (!snapshot || !userId) throw new Error('云端数据尚未加载');
    // Persist a per-account draft before making a network request. Original local data is untouched.
    if (!desired) desired = structuredClone(data);
    await persistDraft();
    if (pending) {
      const result = await apiRequest<{ revision: number }>('/workspace/changesets', pending.body);
      revision = result.revision;
      snapshot = pending.target;
      pending = null;
      await persistDraft();
    }
    const changes = diffDatabase(snapshot, data);
    if (changes.records.length || changes.settings) {
      pending = {
        body: { baseRevision: revision, requestId: uid(), changes },
        target: structuredClone(data),
      };
      const result = await apiRequest<{ revision: number }>('/workspace/changesets', pending.body);
      revision = result.revision;
      snapshot = pending.target;
      pending = null;
    }
    await persistDraft();
  },
};
