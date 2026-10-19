import { useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Check,
  ChevronRight,
  Database,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { stamp, validateDatabase } from '../data/domain';
import { seedDatabase } from '../data/seed';
import { downloadBackup, localRepository } from '../data/repository';
import { cloudMode, windowsLocalMode } from '../lib/api';
import { backupWindowsData } from '../data/windowsRepository';
import { useSession } from '../state/AuthGate';
import { PageHeader, SectionTitle, Toggle } from '../components/common';

export function Settings() {
  const { db, update, setModal, toast, confirm, saveState, retrySave } = useApp();
  const { user, logout } = useSession();
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const patchSettings = (patch: Partial<typeof db.settings>) =>
    update((d) => ({ ...d, settings: stamp({ ...d.settings, ...patch }) }));
  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error('备份文件不能超过 128 MB');
      const parsed = validateDatabase(JSON.parse(await file.text()));
      confirm(
        '用备份替换当前数据？',
        `备份包含 ${parsed.orders.length} 笔订单、${parsed.items.length} 件物品、${parsed.folders.length} 个文件夹、${parsed.tasks.length} 条任务、${parsed.counterparties.length} 个交易对象、${parsed.templates.length} 个模板和 ${parsed.works.length} 件作品。当前内容将被替换，请先导出需要保留的内容。`,
        () => {
          if (windowsLocalMode) {
            void backupWindowsData()
              .then(() => {
                update(() => parsed);
                toast('备份已导入，恢复前数据已备份');
              })
              .catch((e) => toast('恢复已取消：' + e.message));
          } else {
            update(() => parsed);
            toast('备份已导入');
          }
        },
      );
    } catch (e) {
      toast(e instanceof SyntaxError ? '文件不是有效的 JSON 备份' : (e as Error).message);
    } finally {
      setImporting(false);
    }
  }
  const size = new Blob([JSON.stringify(db)]).size;
  return (
    <main className="page settings-page">
      <PageHeader title="设置" subtitle="MADE FOR YOUR EVERYDAY" />
      <button className="profile-card" onClick={() => setModal({ kind: 'profile' })}>
        <span className="profile-avatar">{db.settings.name.slice(0, 1)}</span>
        <div>
          <h2>{db.settings.name}</h2>
          {db.settings.bio && <p>{db.settings.bio}</p>}
          <span>编辑个人资料</span>
        </div>
        <ChevronRight size={18} />
      </button>
      <div className="local-notice">
        <ShieldCheck size={21} />
        <p>
          {cloudMode ? (
            <>
              数据保存至个人云端工作区。
              <small>账号：{user?.username}；保存结果以下方状态为准。</small>
            </>
          ) : windowsLocalMode ? (
            <>
              数据保存在本机 SQLite。
              <small>图片和附件独立保存，关闭浏览器或更新程序不会清除。</small>
            </>
          ) : (
            <>
              数据保存在当前浏览器。<small>本地单用户使用，尚未接入账号或云端同步。</small>
            </>
          )}
        </p>
      </div>
      <section className="paper detail-section settings-section">
        <SectionTitle title="使用偏好" />
        <button
          className="setting-row setting-button"
          onClick={() => setModal({ kind: 'catalog' })}
        >
          <span>订单类型、平台与日历颜色</span>
          <ChevronRight size={16} />
        </button>
        <div className="setting-row">
          <div>
            <strong>紧凑列表</strong>
            <small>减少列表行距，一屏看更多</small>
          </div>
          <Toggle
            label="紧凑列表"
            checked={db.settings.compact}
            onChange={(compact) => patchSettings({ compact })}
          />
        </div>
        <label className="setting-row">
          <div>
            <strong>一周的开始</strong>
            <small>应用于首页和完整日历</small>
          </div>
          <select
            aria-label="一周的开始"
            value={db.settings.weekStart}
            onChange={(e) => patchSettings({ weekStart: e.target.value as 'monday' | 'sunday' })}
          >
            <option value="monday">星期一</option>
            <option value="sunday">星期日</option>
          </select>
        </label>
      </section>
      <section className="paper detail-section settings-section">
        <SectionTitle title="提醒偏好" />
        <div className="setting-row">
          <div>
            <strong>应用内提醒</strong>
            <small>在应用打开时显示到期状态</small>
          </div>
          <Toggle
            label="应用内提醒"
            checked={db.settings.remindersEnabled}
            onChange={(remindersEnabled) => patchSettings({ remindersEnabled })}
          />
        </div>
        <label className="setting-row">
          <div>
            <strong>默认提前提醒</strong>
            <small>用于之后新设置的任务提醒</small>
          </div>
          <select
            aria-label="默认提前提醒"
            value={db.settings.reminderMinutes}
            onChange={(e) => patchSettings({ reminderMinutes: Number(e.target.value) })}
          >
            {[
              [0, '准时'],
              [15, '15 分钟'],
              [30, '30 分钟'],
              [60, '1 小时'],
              [1440, '1 天'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="setting-row setting-button"
          onClick={() => setModal({ kind: 'reminders' })}
        >
          <Bell size={18} />
          <span>查看提醒与即将到期</span>
          <ChevronRight size={16} />
        </button>
      </section>
      <section className="paper detail-section settings-section">
        <SectionTitle title="数据与备份" />
        <div className="data-summary">
          <HardDrive size={20} />
          <div>
            <strong>
              {db.orders.length} 笔订单 · {db.items.length} 件物品
            </strong>
            <small>
              {db.folders.length} 个文件夹 · {db.tasks.length} 条任务 ·{' '}
              {(size / 1024 / 1024).toFixed(2)} MB
            </small>
          </div>
          <span className={saveState === 'error' ? 'danger-text' : ''}>
            {saveState === 'saved' ? '已保存' : saveState === 'saving' ? '保存中' : '保存失败'}
          </span>
        </div>
        {saveState === 'error' && (
          <button className="secondary wide" onClick={retrySave}>
            {cloudMode ? '重试云端保存' : '重试本地保存'}
          </button>
        )}
        {(cloudMode || windowsLocalMode) && (
          <>
            <button
              className="setting-row setting-button"
              onClick={() => {
                void localRepository
                  .load()
                  .then((local) => {
                    if (!local)
                      return toast('此网址没有原有本地记录。可在旧网址导出 JSON 后导入。');
                    confirm(
                      windowsLocalMode
                        ? '将此浏览器原有记录导入电脑数据库？'
                        : '用此浏览器原有记录替换云端内容？',
                      `包含 ${local.orders.length} 笔订单、${local.items.length} 件物品。请先导出当前内容；原浏览器记录仍保留。`,
                      () => update(() => local),
                    );
                  })
                  .catch(() => toast('读取本地记录失败，请从旧网址导出 JSON 备份。'));
              }}
            >
              导入此浏览器原有记录
            </button>
            {cloudMode && (
              <button
                className="setting-row setting-button"
                disabled={saveState !== 'saved'}
                onClick={() => {
                  void logout().catch((e) => toast(e.message));
                }}
              >
                退出登录
              </button>
            )}
          </>
        )}
        {windowsLocalMode && (
          <button
            className="setting-row setting-button"
            disabled={saveState !== 'saved'}
            onClick={() => {
              void backupWindowsData()
                .then((r) => toast('数据库与附件备份已保存：' + r.path))
                .catch((e) => toast(e.message));
            }}
          >
            <HardDrive size={18} />
            <span>备份数据库与附件</span>
            <ChevronRight size={16} />
          </button>
        )}
        <button
          className="setting-row setting-button"
          onClick={() => {
            downloadBackup(db);
            toast('备份已生成，请妥善保存');
          }}
        >
          <ArrowDownToLine size={18} />
          <span>导出完整 JSON 备份</span>
          <ChevronRight size={16} />
        </button>
        <button
          disabled={importing || (windowsLocalMode && saveState !== 'saved')}
          className="setting-row setting-button"
          onClick={() => importInput.current?.click()}
        >
          <ArrowUpFromLine size={18} />
          <span>{importing ? '检查备份中…' : '从 JSON 备份导入'}</span>
          <ChevronRight size={16} />
        </button>
        <input
          ref={importInput}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          aria-label="导入备份文件"
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          className="setting-row setting-button"
          onClick={() =>
            confirm(
              '恢复示例数据？',
              '会替换当前的订单、任务、收纳、交易对象、模板、作品和个人设置。请先导出需要保留的内容。',
              () => {
                update(() => seedDatabase());
                toast('已恢复示例数据');
              },
            )
          }
        >
          <RotateCcw size={18} />
          <span>恢复示例数据</span>
          <ChevronRight size={16} />
        </button>
        <button
          className="setting-row setting-button danger-text"
          onClick={() =>
            confirm(
              cloudMode ? '清空个人云端工作区？' : '清空全部本地记录？',
              '订单、任务、文件夹、物品、交易对象、模板、作品和图片将清空。个人偏好保留。此操作无法撤销，请先导出备份。',
              () => {
                update((d) => ({
                  ...d,
                  orders: [],
                  tasks: [],
                  folders: [],
                  items: [],
                  links: [],
                  counterparties: [],
                  templates: [],
                  works: [],
                }));
                toast('记录已清空');
              },
            )
          }
        >
          <Trash2 size={18} />
          <span>{cloudMode ? '清空云端记录' : '清空本地记录'}</span>
          <ChevronRight size={16} />
        </button>
        <p className="backup-hint">
          {cloudMode
            ? '图片和记录一起保存至服务器数据库。未提交草稿保存在此浏览器，请定期导出完整备份。新设备登录后可读取云端记录。'
            : windowsLocalMode
              ? '数据库与附件保存在 %LOCALAPPDATA%\\Lotus-Workbench 中，与程序源码分离。请定期将完整备份复制到其他磁盘；恢复前会要求确认并保留当前数据。'
              : '图片与记录一起保存在 IndexedDB 中。清除浏览器网站数据会移除这些内容，建议定期导出备份。不同设备与浏览器的数据各自独立。'}
        </p>
      </section>
      <p className="app-signature">
        创作者工作台<span>{cloudMode ? '云端版本 · v3.0' : '本地版本 · v3.0'}</span>
      </p>
    </main>
  );
}
