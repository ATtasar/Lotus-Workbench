import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Database, Attachment } from '../../src/data/types';
import { validateDatabase } from '../../src/data/domain';
import { seedDatabase } from '../../src/data/seed';
import { makeOrder, makeFolder, makeItem, makeTask } from '../../src/data/seed';
import { makeCounterparty, makeTemplate, makeWork } from '../../src/data/workflow';
import { collections, type Changes } from '../../src/data/changeSet';
import type { SqlClient, Storage } from './storage';

export function emptyDatabase(name: string): Database {
  const db = seedDatabase();
  return {
    ...db,
    orders: [],
    tasks: [],
    folders: [],
    items: [],
    links: [],
    counterparties: [],
    templates: [],
    works: [],
    platforms: [],
    settings: { ...db.settings, name },
  };
}
const fields: Record<string, Set<string>> = Object.fromEntries(
  Object.entries({
    orders: makeOrder(),
    tasks: makeTask(),
    folders: makeFolder(),
    items: makeItem(),
    counterparties: makeCounterparty(),
    templates: makeTemplate(),
    works: makeWork(),
    links: { id: '', createdAt: '', updatedAt: '', orderId: '', itemId: '' },
    orderTypes: { id: '', createdAt: '', updatedAt: '', name: '' },
    platforms: { id: '', createdAt: '', updatedAt: '', name: '', color: '' },
  }).map(([key, value]) => [key, new Set(Object.keys(value))]),
);

export function applyChanges(current: Database, changes: Changes): Database {
  if (!changes || !Array.isArray(changes.records) || changes.records.length > 20000)
    throw new BadRequestException('无效的变更批次');
  const next = structuredClone(current);
  const seen = new Set<string>();
  for (const change of changes.records) {
    if (
      !change ||
      !collections.includes(change.collection) ||
      typeof change.id !== 'string' ||
      !change.id ||
      change.id.length > 200
    )
      throw new BadRequestException('无效的实体标识');
    const key = `${change.collection}/${change.id}`;
    if (seen.has(key)) throw new BadRequestException('同一批次不能重复修改实体');
    seen.add(key);
    const list = next[change.collection] as unknown as Record<string, unknown>[];
    const index = list.findIndex((r) => r.id === change.id);
    if (change.remove === true) {
      if (change.values) throw new BadRequestException('删除操作不能包含更新字段');
      if (index >= 0) list.splice(index, 1);
    } else {
      if (
        !change.values ||
        typeof change.values !== 'object' ||
        Array.isArray(change.values) ||
        Object.keys(change.values).some((k) => !fields[change.collection].has(k)) ||
        (change.values.id !== undefined && change.values.id !== change.id)
      )
        throw new BadRequestException('无效的更新字段');
      const value = { ...(index >= 0 ? list[index] : {}), ...change.values, id: change.id };
      if (index >= 0) list[index] = value;
      else list.push(value);
    }
  }
  if (changes.settings) {
    if (Object.keys(changes.settings).some((k) => !Object.keys(current.settings).includes(k)))
      throw new BadRequestException('无效的设置字段');
    next.settings = changes.settings;
  }
  return next;
}

function attachmentGroups(db: Database): Attachment[][] {
  return [
    ...db.orders.map((o) => o.attachments),
    ...db.items.map((i) => i.attachments),
    ...db.folders.map((f) => f.cover),
    ...db.works.map((w) => w.attachments),
  ];
}
const mimes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]);
export async function packFiles(
  client: SqlClient,
  userId: string,
  input: Database,
): Promise<Database> {
  const data = structuredClone(input);
  // Shared graph validation checks relationships and cycles before any SQL write.
  try {
    const check = structuredClone(data);
    for (const group of attachmentGroups(check))
      for (const file of group)
        if (file.data?.startsWith('@file:')) file.data = `data:${file.mime};base64,`;
    validateDatabase(check);
  } catch {
    throw new BadRequestException('记录格式或关联关系无效');
  }
  if (Buffer.byteLength(JSON.stringify(data)) > 128 * 1024 * 1024)
    throw new BadRequestException('工作区数据不能超过 128 MB');
  const refs = new Map<string, Attachment>();
  for (const group of attachmentGroups(data)) {
    if (group.length > 12) throw new BadRequestException('每条记录最多 12 个附件');
    for (const file of group) {
      if (
        !mimes.has(file.mime) ||
        !Number.isInteger(file.size) ||
        file.size < 0 ||
        file.size > 8 * 1024 * 1024
      )
        throw new BadRequestException('附件类型或大小无效');
      if (file.data.startsWith('data:')) {
        const prefix = `data:${file.mime};base64,`;
        if (!file.data.startsWith(prefix)) throw new BadRequestException('附件编码无效');
        const base64 = file.data.slice(prefix.length);
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.length !== file.size || bytes.toString('base64') !== base64)
          throw new BadRequestException('附件大小或内容无效');
        const hash = createHash('sha256')
          .update(file.mime)
          .update('\0')
          .update(bytes)
          .digest('hex');
        await client.query(
          'INSERT INTO studio_files(user_id,hash,mime,content) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [userId, hash, file.mime, bytes],
        );
        file.data = `@file:${hash}`;
      }
      if (!/^@file:[a-f0-9]{64}$/.test(file.data)) throw new BadRequestException('附件引用无效');
      refs.set(file.data.slice(6), file);
    }
  }
  const files = (
    await client.query(
      'SELECT hash,mime,octet_length(content) AS size FROM studio_files WHERE user_id=$1 AND hash=ANY($2::text[])',
      [userId, [...refs.keys()]],
    )
  ).rows;
  if (
    files.length !== refs.size ||
    files.some((f) => refs.get(f.hash)?.mime !== f.mime || refs.get(f.hash)?.size !== f.size)
  )
    throw new BadRequestException('附件不存在或不属于此工作区');
  const hydratedSize =
    Buffer.byteLength(JSON.stringify(data)) +
    attachmentGroups(data)
      .flat()
      .reduce(
        (sum, f) =>
          sum + 4 * Math.ceil(f.size / 3) + `data:${f.mime};base64,`.length - f.data.length,
        0,
      );
  if (hydratedSize > 128 * 1024 * 1024)
    throw new BadRequestException('包含附件的工作区数据不能超过 128 MB');
  return data;
}
export async function unpackFiles(
  client: SqlClient,
  userId: string,
  input: Database,
): Promise<Database> {
  const data = structuredClone(input);
  const groups = attachmentGroups(data);
  const hashes = [...new Set(groups.flat().map((f) => f.data.slice(6)))];
  const files = new Map(
    (
      await client.query(
        'SELECT hash,mime,content FROM studio_files WHERE user_id=$1 AND hash=ANY($2::text[])',
        [userId, hashes],
      )
    ).rows.map((f) => [f.hash, f]),
  );
  for (const group of groups)
    for (const file of group) {
      const stored = files.get(file.data.slice(6));
      if (!stored) throw new Error('Stored attachment is missing');
      file.data = `data:${stored.mime};base64,${Buffer.from(stored.content).toString('base64')}`;
    }
  return validateDatabase(data);
}
export class WorkspaceService {
  constructor(private storage: Storage) {}
  async load(userId: string) {
    const result = await this.storage.query(
      'SELECT revision,data FROM studio_workspaces WHERE user_id=$1',
      [userId],
    );
    if (!result.rows.length) throw new Error('Workspace missing');
    return {
      revision: result.rows[0].revision,
      data: await unpackFiles(this.storage, userId, result.rows[0].data),
    };
  }
  async save(userId: string, body: { baseRevision: number; requestId: string; changes: Changes }) {
    if (
      !body ||
      !Number.isInteger(body.baseRevision) ||
      typeof body.requestId !== 'string' ||
      !/^[\da-f-]{36}$/i.test(body.requestId)
    )
      throw new BadRequestException('无效的提交标识');
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return this.storage.transaction(async (client) => {
      const workspace = (
        await client.query(
          'SELECT revision,data FROM studio_workspaces WHERE user_id=$1 FOR UPDATE',
          [userId],
        )
      ).rows[0];
      if (!workspace) throw new Error('Workspace missing');
      const previous = (
        await client.query(
          'SELECT revision,request_hash FROM studio_mutations WHERE user_id=$1 AND request_id=$2',
          [userId, body.requestId],
        )
      ).rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash)
          throw new ConflictException('提交标识已被其他内容使用');
        return { revision: previous.revision };
      }
      if (workspace.revision !== body.baseRevision)
        throw new ConflictException(
          '其他窗口或设备已修改数据。请导出当前未保存内容，再重新读取云端数据。',
        );
      const next = await packFiles(client, userId, applyChanges(workspace.data, body.changes));
      const revision = workspace.revision + 1;
      await client.query(
        'UPDATE studio_workspaces SET data=$2::jsonb,revision=$3,updated_at=now() WHERE user_id=$1',
        [userId, JSON.stringify(next), revision],
      );
      await client.query(
        'INSERT INTO studio_mutations(user_id,request_id,request_hash,revision) VALUES($1,$2,$3,$4)',
        [userId, body.requestId, requestHash, revision],
      );
      const refs = [
        ...new Set(
          attachmentGroups(next)
            .flat()
            .map((f) => f.data.slice(6)),
        ),
      ];
      await client.query(
        'DELETE FROM studio_files WHERE user_id=$1 AND NOT(hash=ANY($2::text[]))',
        [userId, refs],
      );
      // Retry receipts are small; retain the newest 1000 for each workspace.
      await client.query('DELETE FROM studio_mutations WHERE user_id=$1 AND revision < $2', [
        userId,
        revision - 1000,
      ]);
      return { revision };
    });
  }
}
