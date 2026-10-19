import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateDatabase } from '../src/data/domain';
import { seedDatabase } from '../src/data/seed';
import { collections } from '../src/data/changeSet';
import type { Attachment, Database } from '../src/data/types';
import {
  initialData as emptyDesktop,
  validateBackup as validateDesktop,
} from '../desktop/model.js';
import type { DesktopData } from '../desktop/model.js';

export const APP_ID = 'lotus-workbench-windows-v1';
export const SCHEMA_VERSION = 2;
const desktopCollections = [
  'platforms',
  'clients',
  'archivedClients',
  'orders',
  'templates',
  'assets',
  'toolTemplates',
] as const;
function desktopImages(data: DesktopData, map: (src: string) => string) {
  for (const item of [...data.orders, ...data.templates]) item.images = item.images.map(map);
  for (const asset of data.assets) asset.src = map(asset.src);
  for (const template of data.toolTemplates) {
    if (template.image) template.image = map(template.image);
    if (template.kind === 'layout')
      for (const item of template.layout.items) item.src = map(item.src);
  }
  if (data.watermarkMark) data.watermarkMark = map(data.watermarkMark);
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const allowedMimes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]);
const groups = (d: Database): Attachment[][] => [
  ...d.orders.map((x) => x.attachments),
  ...d.items.map((x) => x.attachments),
  ...d.folders.map((x) => x.cover),
  ...d.works.map((x) => x.attachments),
];
export function emptyDatabase(): Database {
  const db = seedDatabase();
  for (const key of collections) if (key !== 'orderTypes' && key !== 'platforms') db[key] = [];
  db.settings.name = '创作者';
  db.settings.bio = '';
  return db;
}
export class LocalConflict extends Error {}
function durableWrite(file: string, bytes: Buffer) {
  const fd = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function syncFile(file: string) {
  const fd = fs.openSync(file, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function promoteFile(from: string, to: string) {
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    syncFile(to);
    fs.unlinkSync(from);
  }
}
function preserveDirectory(from: string, to: string) {
  fs.mkdirSync(to);
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, item.name),
      destination = path.join(to, item.name);
    if (item.isDirectory()) preserveDirectory(source, destination);
    else if (item.isFile()) {
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      syncFile(destination);
      if (hash(fs.readFileSync(source)) !== hash(fs.readFileSync(destination)))
        throw new Error('恢复前原目录复制校验失败，未替换数据。');
    } else throw new Error('数据目录存在特殊链接，恢复已停止，请保留原目录。');
  }
}
function finishPendingRestore(root: string) {
  const journal = path.join(root, 'restore-journal.json');
  if (!fs.existsSync(journal)) return;
  const record = JSON.parse(fs.readFileSync(journal, 'utf8'));
  if (
    record.format !== 1 ||
    typeof record.stage !== 'string' ||
    !/^restore-[a-f0-9-]+$/.test(record.stage) ||
    !record.files?.['workbench.sqlite']
  )
    throw new Error('恢复日志损坏，已停止启动，原数据与备份保留。');
  const staged = path.join(root, record.stage, 'data'),
    active = path.join(root, 'data');
  const entries = Object.entries(record.files) as [string, string][];
  for (const [name, digest] of entries) {
    if (
      (name !== 'workbench.sqlite' && !/^files\/[a-f0-9]{64}$/.test(name)) ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      hash(fs.readFileSync(path.join(staged, name))) !== digest
    )
      throw new Error('恢复暂存文件校验失败，原数据与备份保留。');
  }
  fs.mkdirSync(path.join(active, 'files'), { recursive: true });
  // All source files were verified before changing the active directory. A
  // persistent journal lets startup finish an interrupted, confirmed restore.
  for (const suffix of ['-wal', '-shm']) {
    const file = path.join(active, 'workbench.sqlite' + suffix);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  for (const [name, digest] of entries.sort(
    ([a], [b]) => (a === 'workbench.sqlite' ? 1 : 0) - (b === 'workbench.sqlite' ? 1 : 0),
  )) {
    const destination = path.join(active, name);
    fs.copyFileSync(path.join(staged, name), destination);
    syncFile(destination);
    if (hash(fs.readFileSync(destination)) !== digest)
      throw new Error('恢复写入校验失败，保留恢复日志以供重试。');
  }
  fs.unlinkSync(journal);
}
export class LocalStore {
  readonly dataDir: string;
  readonly filesDir: string;
  readonly db: DatabaseSync;
  constructor(readonly root: string) {
    finishPendingRestore(root);
    this.dataDir = path.join(root, 'data');
    this.filesDir = path.join(this.dataDir, 'files');
    fs.mkdirSync(this.filesDir, { recursive: true });
    this.db = new DatabaseSync(path.join(this.dataDir, 'workbench.sqlite'));
    try {
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
      const v = Number((this.db.prepare('PRAGMA user_version').get() as any).user_version);
      if (v > SCHEMA_VERSION)
        throw new Error('数据库来自较新程序，禁止降级或清空。请使用兼容版本。');
      if (v === 0) {
        const existing = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        if (existing.length)
          throw new Error('发现未标记版本的已有数据库，已停止初始化以保护数据。');
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.exec(
            'CREATE TABLE workspace(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, version INTEGER NOT NULL, settings TEXT NOT NULL); CREATE TABLE files(hash TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL);',
          );
          const references: Record<string, string> = {
            orders:
              ', counterparty_id TEXT REFERENCES counterparties(id) DEFERRABLE INITIALLY DEFERRED',
            tasks: ', order_id TEXT REFERENCES orders(id) DEFERRABLE INITIALLY DEFERRED',
            folders: ', parent_id TEXT REFERENCES folders(id) DEFERRABLE INITIALLY DEFERRED',
            items: ', folder_id TEXT REFERENCES folders(id) DEFERRABLE INITIALLY DEFERRED',
            links:
              ', order_id TEXT NOT NULL REFERENCES orders(id) DEFERRABLE INITIALLY DEFERRED, item_id TEXT NOT NULL REFERENCES items(id) DEFERRABLE INITIALLY DEFERRED, UNIQUE(order_id,item_id)',
            works: ', order_id TEXT REFERENCES orders(id) DEFERRABLE INITIALLY DEFERRED',
          };
          for (const key of collections)
            this.db.exec(
              `CREATE TABLE "${key}"(id TEXT PRIMARY KEY, payload TEXT NOT NULL${references[key] || ''})`,
            );
          this.db.exec(
            'CREATE INDEX folders_parent ON folders(parent_id); CREATE INDEX items_folder ON items(folder_id); CREATE INDEX tasks_order ON tasks(order_id); PRAGMA user_version=1;',
          );
          const data = emptyDatabase();
          for (const key of ['orderTypes', 'platforms'] as const)
            for (const record of data[key])
              this.db
                .prepare(`INSERT INTO "${key}" VALUES(?,?)`)
                .run(record.id, JSON.stringify(record));
          this.db
            .prepare('INSERT INTO workspace VALUES(1,0,3,?)')
            .run(JSON.stringify(data.settings));
          this.db.exec('COMMIT');
        } catch (e) {
          this.db.exec('ROLLBACK');
          throw e;
        }
      }
      // Future schema changes must take a full backup and execute explicit
      // version steps in a transaction. Never recreate an existing database.
      if (v <= 1) {
        // Keep the former mobile tables intact. The desktop UI has its own
        // original data model and must never reinterpret or replace them.
        if (v === 1) this.backup('before-desktop-migration');
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.exec(
            'CREATE TABLE desktop_workspace(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, metadata TEXT NOT NULL); CREATE TABLE desktop_records(collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id));',
          );
          const data = emptyDesktop();
          const metadata = { ...data } as Partial<DesktopData>;
          for (const key of desktopCollections) delete metadata[key];
          this.db
            .prepare('INSERT INTO desktop_workspace VALUES(1,0,?)')
            .run(JSON.stringify(metadata));
          this.db.exec('PRAGMA user_version=2; COMMIT');
        } catch (e) {
          this.db.exec('ROLLBACK');
          throw e;
        }
      }
      const check = this.db.prepare('PRAGMA quick_check').get() as any;
      if (check.quick_check !== 'ok')
        throw new Error('SQLite 完整性检查失败，原数据保留，请从备份恢复。');
      if (!this.db.prepare('SELECT id FROM workspace WHERE id=1').get())
        throw new Error('工作区元数据缺失，禁止用空数据覆盖。');
      this.db.exec('PRAGMA journal_mode=WAL');
    } catch (e) {
      this.db.close();
      throw e;
    }
  }
  load() {
    const row = this.db.prepare('SELECT * FROM workspace WHERE id=1').get() as any;
    const data: any = { version: row.version, settings: JSON.parse(row.settings) };
    for (const key of collections)
      data[key] = this.db
        .prepare(`SELECT payload FROM "${key}" ORDER BY rowid`)
        .all()
        .map((r: any) => JSON.parse(r.payload));
    for (const list of groups(data))
      for (const file of list) {
        if (!/^@disk:[a-f0-9]{64}$/.test(file.data))
          throw new Error('数据库附件引用无效，已停止读取。');
        const id = file.data.slice(6),
          info = this.db.prepare('SELECT mime,size FROM files WHERE hash=?').get(id) as any;
        const bytes = fs.readFileSync(path.join(this.filesDir, id));
        if (
          !info ||
          info.mime !== file.mime ||
          info.size !== file.size ||
          bytes.length !== file.size ||
          hash(Buffer.concat([Buffer.from(file.mime + '\0'), bytes])) !== id
        )
          throw new Error('附件缺失或校验失败，请保留数据并恢复完整备份。');
        file.data = `data:${file.mime};base64,${bytes.toString('base64')}`;
      }
    return { revision: Number(row.revision), data: validateDatabase(data) };
  }
  save(input: unknown, baseRevision: number) {
    const data = validateDatabase(structuredClone(input));
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0)
      throw new Error('无效的数据版本。');
    const current = this.load();
    if (current.revision !== baseRevision)
      throw new LocalConflict(
        '其他窗口已修改数据。请先导出当前内容，再重新打开页面；不会覆盖较新的记录。',
      );
    // Deletions/imports/clears are protected by a full pre-change backup.
    if (
      collections.some((key) =>
        current.data[key].some((x) => !data[key].some((y) => x.id === y.id)),
      )
    )
      this.backup('before-change');
    const files = new Map<string, { mime: string; size: number }>(),
      processed = new WeakSet<Attachment>();
    for (const list of groups(data)) {
      if (list.length > 12) throw new Error('每条记录最多 12 个附件。');
      for (const file of list) {
        if (processed.has(file)) continue;
        const prefix = `data:${file.mime};base64,`;
        if (
          !allowedMimes.has(file.mime) ||
          !file.data.startsWith(prefix) ||
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          file.size > 8 * 1024 * 1024
        )
          throw new Error('附件类型或大小无效。');
        const encoded = file.data.slice(prefix.length),
          bytes = Buffer.from(encoded, 'base64');
        if (bytes.length !== file.size || bytes.toString('base64') !== encoded)
          throw new Error('附件内容与大小不一致。');
        const id = hash(Buffer.concat([Buffer.from(file.mime + '\0'), bytes]));
        const destination = path.join(this.filesDir, id);
        if (!fs.existsSync(destination)) {
          const temporary = destination + '.' + randomUUID() + '.pending';
          try {
            durableWrite(temporary, bytes);
            promoteFile(temporary, destination);
          } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
          }
        } else if (!fs.readFileSync(destination).equals(bytes))
          throw new Error('已有附件校验失败，停止保存。');
        files.set(id, { mime: file.mime, size: file.size });
        file.data = '@disk:' + id;
        processed.add(file);
      }
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.db
        .prepare(
          'UPDATE workspace SET revision=revision+1,version=3,settings=? WHERE id=1 AND revision=?',
        )
        .run(JSON.stringify(data.settings), baseRevision);
      if (updated.changes !== 1) throw new LocalConflict('数据版本已变化，已取消覆盖。');
      for (const key of [...collections].reverse()) this.db.exec(`DELETE FROM "${key}"`);
      const foreignKeys: Record<string, string[]> = {
        orders: ['counterpartyId'],
        tasks: ['orderId'],
        folders: ['parentId'],
        items: ['folderId'],
        links: ['orderId', 'itemId'],
        works: ['orderId'],
      };
      for (const key of collections) {
        const extra = foreignKeys[key] || [],
          stmt = this.db.prepare(
            `INSERT INTO "${key}" VALUES(${Array(2 + extra.length)
              .fill('?')
              .join(',')})`,
          );
        for (const item of data[key])
          stmt.run(item.id, JSON.stringify(item), ...extra.map((k) => (item as any)[k] ?? null));
      }
      const insert = this.db.prepare('INSERT OR IGNORE INTO files VALUES(?,?,?)');
      for (const [id, f] of files) insert.run(id, f.mime, f.size);
      this.db.exec('COMMIT');
      return baseRevision + 1;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  desktopRevision(): number {
    const row = this.db.prepare('SELECT revision FROM desktop_workspace WHERE id=1').get() as any;
    if (!row) throw new Error('电脑端工作区缺失，禁止用空白数据覆盖。');
    return Number(row.revision);
  }
  loadDesktop(): { revision: number; data: DesktopData } {
    const row = this.db
      .prepare('SELECT revision,metadata FROM desktop_workspace WHERE id=1')
      .get() as any;
    if (!row) throw new Error('电脑端工作区缺失，禁止用空白数据覆盖。');
    const data = JSON.parse(row.metadata) as DesktopData;
    for (const key of desktopCollections)
      data[key] = this.db
        .prepare('SELECT payload FROM desktop_records WHERE collection=? ORDER BY rowid')
        .all(key)
        .map((record: any) => JSON.parse(record.payload));
    desktopImages(data, (value) => {
      if (!/^@disk:[a-f0-9]{64}$/.test(value)) throw new Error('电脑端图片引用无效。');
      const id = value.slice(6);
      const info = this.db.prepare('SELECT mime,size FROM files WHERE hash=?').get(id) as any;
      const bytes = fs.readFileSync(path.join(this.filesDir, id));
      if (
        !info ||
        bytes.length !== info.size ||
        hash(Buffer.concat([Buffer.from(info.mime + '\0'), bytes])) !== id
      )
        throw new Error('电脑端图片缺失或校验失败，请保留原数据并恢复完整备份。');
      return info.mime === 'image/svg+xml'
        ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(bytes.toString('utf8'))
        : `data:${info.mime};base64,${bytes.toString('base64')}`;
    });
    return { revision: Number(row.revision), data: validateDesktop(data) };
  }
  saveDesktop(input: unknown, baseRevision: number) {
    const data = validateDesktop(structuredClone(input));
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0)
      throw new Error('无效的数据版本。');
    const current = this.loadDesktop();
    if (current.revision !== baseRevision)
      throw new LocalConflict('其他窗口已保存新记录。请先导出当前窗口备份，再刷新；已取消覆盖。');
    if (
      desktopCollections.some((key) =>
        current.data[key].some((old) => !data[key].some((next) => next.id === old.id)),
      )
    )
      this.backup('before-desktop-change');
    const files = new Map<string, { mime: string; size: number }>();
    desktopImages(data, (value) => {
      let mime: string, bytes: Buffer;
      if (value.startsWith('data:image/svg+xml;charset=utf-8,')) {
        mime = 'image/svg+xml';
        bytes = Buffer.from(
          decodeURIComponent(value.slice('data:image/svg+xml;charset=utf-8,'.length)),
          'utf8',
        );
      } else {
        const match = /^data:(image\/(?:png|jpeg|webp|gif|bmp));base64,([a-z0-9+/=\r\n]+)$/i.exec(
          value,
        );
        if (!match) throw new Error('图片格式不正确。');
        mime = match[1].toLowerCase();
        const encoded = match[2].replace(/[\r\n]/g, '');
        bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded) throw new Error('图片编码损坏。');
      }
      if (bytes.length > 16 * 1024 * 1024) throw new Error('单张图片不得超过 16 MB。');
      const id = hash(Buffer.concat([Buffer.from(mime + '\0'), bytes]));
      const destination = path.join(this.filesDir, id);
      if (!fs.existsSync(destination)) {
        const pending = destination + '.' + randomUUID() + '.pending';
        try {
          durableWrite(pending, bytes);
          promoteFile(pending, destination);
        } finally {
          if (fs.existsSync(pending)) fs.unlinkSync(pending);
        }
      } else if (!fs.readFileSync(destination).equals(bytes))
        throw new Error('已有图片校验失败，停止保存。');
      files.set(id, { mime, size: bytes.length });
      return '@disk:' + id;
    });
    const metadata = { ...data } as Partial<DesktopData>;
    for (const key of desktopCollections) delete metadata[key];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.db
        .prepare(
          'UPDATE desktop_workspace SET revision=revision+1,metadata=? WHERE id=1 AND revision=?',
        )
        .run(JSON.stringify(metadata), baseRevision);
      if (updated.changes !== 1) throw new LocalConflict('电脑端数据已变化，已取消覆盖。');
      this.db.exec('DELETE FROM desktop_records');
      const insert = this.db.prepare('INSERT INTO desktop_records VALUES(?,?,?)');
      for (const key of desktopCollections)
        for (const record of data[key]) insert.run(key, record.id, JSON.stringify(record));
      const fileInsert = this.db.prepare('INSERT OR IGNORE INTO files VALUES(?,?,?)');
      for (const [id, file] of files) fileInsert.run(id, file.mime, file.size);
      this.db.exec('COMMIT');
      return baseRevision + 1;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  backup(label = 'manual') {
    const destination = path.join(
      this.root,
      'backups',
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}-${randomUUID().slice(0, 8)}`,
    );
    const pending = destination;
    fs.mkdirSync(path.join(pending, 'files'), { recursive: true });
    // VACUUM INTO creates a consistent SQLite snapshot including WAL commits.
    this.db.exec(
      "VACUUM INTO '" + path.join(pending, 'workbench.sqlite').replaceAll("'", "''") + "'",
    );
    const snapshot = fs.openSync(path.join(pending, 'workbench.sqlite'), 'r+');
    try {
      fs.fsyncSync(snapshot);
    } finally {
      fs.closeSync(snapshot);
    }
    const list: Record<string, string> = {
      'workbench.sqlite': hash(fs.readFileSync(path.join(pending, 'workbench.sqlite'))),
    };
    for (const info of this.db.prepare('SELECT hash,mime,size FROM files').all() as any[]) {
      if (!/^[a-f0-9]{64}$/.test(info.hash)) throw new Error('数据库附件编号无效，备份已停止。');
      const bytes = fs.readFileSync(path.join(this.filesDir, info.hash));
      if (
        bytes.length !== info.size ||
        hash(Buffer.concat([Buffer.from(info.mime + '\0'), bytes])) !== info.hash
      )
        throw new Error('备份附件校验失败，原数据保留。');
      durableWrite(path.join(pending, 'files', info.hash), bytes);
      list['files/' + info.hash] = hash(bytes);
    }
    // The manifest is the completion marker and is written last. This avoids
    // renaming directories while Windows indexers/antivirus hold file handles.
    durableWrite(
      path.join(pending, 'backup.json'),
      Buffer.from(
        JSON.stringify(
          {
            appId: APP_ID,
            format: 1,
            schemaVersion: Number(
              (this.db.prepare('PRAGMA user_version').get() as any).user_version,
            ),
            createdAt: new Date().toISOString(),
            files: list,
          },
          null,
          2,
        ),
      ),
    );
    return destination;
  }
  close() {
    this.db.close();
  }
}
export function restoreBackup(root: string, source: string) {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'backup.json'), 'utf8'));
  if (
    manifest.appId !== APP_ID ||
    manifest.format !== 1 ||
    !Number.isInteger(manifest.schemaVersion) ||
    manifest.schemaVersion < 1 ||
    manifest.schemaVersion > SCHEMA_VERSION ||
    !manifest.files?.['workbench.sqlite']
  )
    throw new Error('备份格式或数据库版本不兼容。');
  const stage = path.join(root, 'restore-' + randomUUID());
  fs.mkdirSync(path.join(stage, 'data/files'), { recursive: true });
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (name !== 'workbench.sqlite' && !/^files\/[a-f0-9]{64}$/.test(name))
      throw new Error('备份路径不安全。');
    const bytes = fs.readFileSync(path.join(source, name));
    if (hash(bytes) !== digest) throw new Error('备份文件摘要不匹配，恢复已停止：' + name);
    durableWrite(path.join(stage, 'data', name), bytes);
  }
  const candidate = new LocalStore(stage);
  try {
    candidate.load();
    candidate.loadDesktop();
  } finally {
    candidate.close();
  }
  let before: string | undefined, warning: string | undefined;
  if (fs.existsSync(path.join(root, 'data/workbench.sqlite'))) {
    try {
      const current = new LocalStore(root);
      try {
        before = current.backup('before-restore');
      } finally {
        current.close();
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('较新程序')) throw e;
      // Keep the damaged original directory when recovering a verified backup.
      warning = '当前库或附件无法完成校验备份；原 data 目录将完整保留在 preserved-data 中。';
    }
  }
  const preserved = path.join(
    root,
    'preserved-data-' +
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
  );
  const active = path.join(root, 'data');
  const existed = fs.existsSync(active);
  if (existed) preserveDirectory(active, preserved);
  const restoreFiles: Record<string, string> = {};
  for (const name of Object.keys(manifest.files))
    restoreFiles[name] = hash(fs.readFileSync(path.join(stage, 'data', name)));
  durableWrite(
    path.join(root, 'restore-journal.json'),
    Buffer.from(JSON.stringify({ format: 1, stage: path.basename(stage), files: restoreFiles })),
  );
  finishPendingRestore(root);
  // The original directory copy and validated staging files are never deleted.
  return { before, preserved: existed ? preserved : null, warning };
}
