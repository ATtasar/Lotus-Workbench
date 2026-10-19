import { useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Folder,
  Image,
  ScrollText,
  CalendarPlus,
  Boxes,
  Search,
  Link2,
  UsersRound,
  LayoutTemplate,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { canMoveFolder, entity, folderPath, stamp, taskReminders } from '../data/domain';
import { useNow } from '../lib/useNow';
import { dateKey, shortDate } from '../lib/date';
import type { Modal } from '../data/types';
import { Empty, Field, FormSection, ItemArt, SearchInput, Sheet } from './common';
import { FolderForm, ItemForm, OrderForm, TaskForm } from './Forms';
import { CatalogSheet } from './CatalogFields';
import {
  CounterpartyForm,
  CounterpartyLink,
  ScheduleForm,
  TemplateForm,
  WorkDetail,
  WorkForm,
} from './WorkflowForms';

function GlobalSearch() {
  const { db, setModal, navigate } = useApp();
  const [query, setQuery] = useState('');
  const match = (...values: string[]) =>
    !!query.trim() && values.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const orders = db.orders.filter((o) => match(o.name, o.number, o.party, o.platform));
  const folders = db.folders.filter((f) => match(f.name, f.merchant, ...f.tags));
  const items = db.items.filter((i) => match(i.name, i.merchant, ...i.tags));
  const parties = db.counterparties.filter((p) => match(p.name, p.platform, p.contact));
  const templates = db.templates.filter((t) => match(t.name, t.type));
  const works = db.works.filter((w) => match(w.name, ...w.tags));
  const count =
    orders.length +
    folders.length +
    items.length +
    parties.length +
    templates.length +
    works.length;
  function open(detail: 'order' | 'folder' | 'item', id: string) {
    setModal(null);
    navigate({ page: detail === 'order' ? 'orders' : 'storage', detail, id });
  }
  return (
    <Sheet title="全局搜索" onClose={() => setModal(null)}>
      <div className="sheet-body search-sheet">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="搜索订单、物品、文件夹、标签…"
        />
        {query && <p className="muted small">找到 {count} 条结果 · 包含归档内容</p>}
        {orders.length > 0 && (
          <div className="search-group">
            <span className="eyebrow">订单 / {orders.length}</span>
            {orders.map((o) => (
              <button key={o.id} onClick={() => open('order', o.id)}>
                <span className="search-result-icon">
                  <ScrollText size={20} />
                </span>
                <div>
                  <strong>{o.name}</strong>
                  <small>
                    {o.number || o.type} · {o.party || '未填写交易对象'}
                    {o.archived ? ' · 已归档' : ''}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {folders.length > 0 && (
          <div className="search-group">
            <span className="eyebrow">文件夹 / {folders.length}</span>
            {folders.map((f) => (
              <button key={f.id} onClick={() => open('folder', f.id)}>
                <span className="search-result-icon green">
                  <Folder size={20} />
                </span>
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {folderPath(db.folders, f.id)
                      .map((p) => p.name)
                      .join(' / ')}
                    {f.archived ? ' · 已归档' : ''}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <div className="search-group">
            <span className="eyebrow">物品 / {items.length}</span>
            {items.map((i) => (
              <button key={i.id} onClick={() => open('item', i.id)}>
                <ItemArt item={i} />
                <div>
                  <strong>{i.name}</strong>
                  <small>
                    {folderPath(db.folders, i.folderId)
                      .map((p) => p.name)
                      .join(' / ') || '根目录'}
                    {i.archived ? ' · 已归档' : ''}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {parties.length > 0 && (
          <div className="search-group">
            <span className="eyebrow">交易对象 / {parties.length}</span>
            {parties.map((p) => (
              <button key={p.id} onClick={() => setModal({ kind: 'counterparty', id: p.id })}>
                <span className="search-result-icon">
                  <UsersRound size={20} />
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.platform || '未填写平台'} · {p.role}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {templates.length > 0 && (
          <div className="search-group">
            <span className="eyebrow">订单模板 / {templates.length}</span>
            {templates.map((t) => (
              <button key={t.id} onClick={() => setModal({ kind: 'template', id: t.id })}>
                <span className="search-result-icon">
                  <LayoutTemplate size={20} />
                </span>
                <div>
                  <strong>{t.name}</strong>
                  <small>
                    {t.type} · {t.duration} 天工期
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {works.length > 0 && (
          <div className="search-group">
            <span className="eyebrow">作品 / {works.length}</span>
            {works.map((w) => (
              <button key={w.id} onClick={() => setModal({ kind: 'work-detail', id: w.id })}>
                <ItemArt item={w} />
                <div>
                  <strong>{w.name}</strong>
                  <small>
                    {w.category} · {w.date || '未设置日期'}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {!query && (
          <Empty
            title="输入关键词搜索"
            description="输入名称、订单编号、交易对象、商家或标签，跨模块查找。"
            icon={<Search size={24} />}
          />
        )}{' '}
        {!!query && count === 0 && (
          <Empty title="暂时没有找到" description="试试短一点的名称，或换一个关键词。" />
        )}
      </div>
    </Sheet>
  );
}
function MoveSheet({ modal }: { modal: Extract<Modal, { kind: 'move' }> }) {
  const { db, update, setModal, toast } = useApp();
  const object =
    modal.entity === 'folder'
      ? db.folders.find((f) => f.id === modal.id)
      : db.items.find((i) => i.id === modal.id);
  const [target, setTarget] = useState<string | null>(() =>
    object ? ('parentId' in object ? object.parentId : object.folderId) : null,
  );
  const [query, setQuery] = useState('');
  const folders = db.folders.filter(
    (f) =>
      (modal.entity !== 'folder' || canMoveFolder(db.folders, modal.id, f.id)) &&
      folderPath(db.folders, f.id)
        .map((p) => p.name)
        .join('/')
        .includes(query),
  );
  function move() {
    if (modal.entity === 'folder' && !canMoveFolder(db.folders, modal.id, target))
      return toast('不能移动到自身或后代文件夹');
    if (target && !db.folders.some((f) => f.id === target)) return toast('目标文件夹已不存在');
    update((d) =>
      modal.entity === 'folder'
        ? {
            ...d,
            folders: d.folders.map((f) =>
              f.id === modal.id ? stamp({ ...f, parentId: target }) : f,
            ),
          }
        : {
            ...d,
            items: d.items.map((i) => (i.id === modal.id ? stamp({ ...i, folderId: target }) : i)),
          },
    );
    setModal(null);
    toast('已移动，原有档案与关联均保留');
  }
  return (
    <Sheet
      title={`移动${modal.entity === 'folder' ? '文件夹' : '物品'}`}
      onClose={() => setModal(null)}
    >
      <div className="sheet-body">
        <p className="muted">选择「{object?.name}」的新位置</p>
        <SearchInput value={query} onChange={setQuery} placeholder="查找目标文件夹…" />
        <div className="selection-list">
          <button className={target === null ? 'selected' : ''} onClick={() => setTarget(null)}>
            <Folder size={20} />
            <span>根目录</span>
            {target === null && <Check size={18} />}
          </button>
          {folders.map((f) => (
            <button
              className={target === f.id ? 'selected' : ''}
              key={f.id}
              onClick={() => setTarget(f.id)}
            >
              <Folder size={20} />
              <span>
                {folderPath(db.folders, f.id)
                  .map((p) => p.name)
                  .join(' / ')}
                {f.archived ? '（已归档）' : ''}
              </span>
              {target === f.id && <Check size={18} />}
            </button>
          ))}
        </div>
        <p className="muted small">自身与后代文件夹已从可选位置中排除。</p>
        <button className="primary wide" onClick={move}>
          移动到这里
        </button>
      </div>
    </Sheet>
  );
}
function LinkSheet({ modal }: { modal: Extract<Modal, { kind: 'link' }> }) {
  const { db, update, setModal, toast } = useApp();
  const [selected, setSelected] = useState(
    () =>
      new Set(
        db.links
          .filter((l) =>
            modal.entity === 'order' ? l.orderId === modal.id : l.itemId === modal.id,
          )
          .map((l) => (modal.entity === 'order' ? l.itemId : l.orderId)),
      ),
  );
  const [query, setQuery] = useState('');
  const values = (modal.entity === 'order' ? db.items : db.orders).filter((v) =>
    v.name.includes(query),
  );
  function save() {
    update((d) => {
      const retained = d.links.filter((l) =>
        modal.entity === 'order' ? l.orderId !== modal.id : l.itemId !== modal.id,
      );
      const links = [...selected].map((id) => {
        const orderId = modal.entity === 'order' ? modal.id : id;
        const itemId = modal.entity === 'order' ? id : modal.id;
        return (
          d.links.find((l) => l.orderId === orderId && l.itemId === itemId) || {
            ...entity(),
            orderId,
            itemId,
          }
        );
      });
      return { ...d, links: [...retained, ...links] };
    });
    setModal(null);
    toast('关联已更新');
  }
  return (
    <Sheet
      title={modal.entity === 'order' ? '关联已有物品' : '关联已有订单'}
      onClose={() => setModal(null)}
    >
      <div className="sheet-body">
        <p className="muted">支持多选。取消关联会保留双方原始档案。</p>
        <SearchInput value={query} onChange={setQuery} />
        <div className="selection-list">
          {values.map((v) => (
            <button
              key={v.id}
              aria-label={`${v.name}${v.archived ? '（已归档）' : ''}`}
              aria-pressed={selected.has(v.id)}
              className={selected.has(v.id) ? 'selected' : ''}
              onClick={() =>
                setSelected((old) => {
                  const next = new Set(old);
                  if (next.has(v.id)) next.delete(v.id);
                  else next.add(v.id);
                  return next;
                })
              }
            >
              {'folderId' in v ? <ItemArt item={v} /> : <ScrollText size={20} />}
              <span>
                {v.name}
                {v.archived ? '（已归档）' : ''}
              </span>
              {selected.has(v.id) && <Check size={18} />}
            </button>
          ))}
        </div>
        {values.length === 0 && <Empty title="暂时没有可关联的记录" />}
        <button className="primary wide" onClick={save}>
          保存关联（{selected.size}）
        </button>
      </div>
    </Sheet>
  );
}
function CreateSheet({ modal }: { modal: Extract<Modal, { kind: 'create' }> }) {
  const { setModal } = useApp();
  return (
    <Sheet title="新建记录" onClose={() => setModal(null)}>
      <div className="sheet-body create-options">
        {[
          {
            title: '新建订单',
            desc: '接稿、约稿、购买与定制',
            icon: <ScrollText />,
            modal: { kind: 'order' } as Modal,
          },
          {
            title: '添加物品',
            desc: '记录物品、图片与收纳位置',
            icon: <Image />,
            modal: { kind: 'item', folderId: modal.folderId } as Modal,
          },
          {
            title: '新建文件夹',
            desc: '建立文件夹与子文件夹',
            icon: <Folder />,
            modal: { kind: 'folder', parentId: modal.folderId } as Modal,
          },
          {
            title: '添加任务',
            desc: '添加个人或订单任务',
            icon: <CalendarPlus />,
            modal: { kind: 'task' } as Modal,
          },
        ].map((option) => (
          <button key={option.title} onClick={() => setModal(option.modal)}>
            <span>{option.icon}</span>
            <div>
              <strong>{option.title}</strong>
              <small>{option.desc}</small>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
function ProfileSheet() {
  const { db, update, setModal, toast } = useApp();
  const [name, setName] = useState(db.settings.name);
  const [bio, setBio] = useState(db.settings.bio);
  return (
    <Sheet
      title="编辑个人资料"
      dirty={name !== db.settings.name || bio !== db.settings.bio}
      onClose={() => setModal(null)}
    >
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return toast('请填写称呼');
          update((d) => ({ ...d, settings: stamp({ ...d.settings, name: name.trim(), bio }) }));
          setModal(null);
          toast('个人资料已保存');
        }}
      >
        <FormSection title="关于你">
          <Field label="称呼 *" full>
            <input required maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="一句话介绍" full>
            <textarea maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} />
          </Field>
        </FormSection>
        <div className="form-footer">
          <button className="primary" type="submit">
            保存资料
          </button>
        </div>
      </form>
    </Sheet>
  );
}
function RemindersSheet() {
  const { db, setModal, navigate } = useApp();
  const now = useNow();
  const tasks = taskReminders(db);
  const upcoming = db.orders
    .filter(
      (o) =>
        !o.archived &&
        o.status !== '已完成' &&
        o.dueDate &&
        o.dueDate <= dateKey(new Date(now + 7 * 86400000)),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <Sheet title="提醒与即将到期" onClose={() => setModal(null)}>
      <div className="sheet-body">
        <div className="local-notice">
          <Bell size={20} />
          <p>
            {db.settings.remindersEnabled
              ? '应用内提醒已开启，每 30 秒更新。'
              : '应用内提醒已暂停，可在「我的」中开启。'}
            <small>网页关闭后不会推送；无需浏览器通知权限。</small>
          </p>
        </div>
        <h3 className="subheading">任务提醒 / {tasks.length}</h3>
        {tasks.map((t) => {
          const due = new Date(t.reminder.at).getTime() <= now;
          return (
            <button
              className={`reminder-row ${due && db.settings.remindersEnabled ? 'due' : ''}`}
              key={t.id}
              onClick={() => setModal({ kind: 'task', id: t.id })}
            >
              <Bell size={18} />
              <div>
                <strong>{t.name}</strong>
                <small>{t.reminder.at.replace('T', ' ')}</small>
              </div>
              <span>
                {!db.settings.remindersEnabled ? '已暂停' : due ? '已到提醒时间' : '等待提醒'}
              </span>
            </button>
          );
        })}
        {tasks.length === 0 && <p className="muted">没有待提醒的任务。可在任务编辑中设置提醒。</p>}
        <h3 className="subheading">七日内截止与逾期订单 / {upcoming.length}</h3>
        {upcoming.map((o) => (
          <button
            className="reminder-row"
            key={o.id}
            onClick={() => {
              setModal(null);
              navigate({ page: 'orders', detail: 'order', id: o.id });
            }}
          >
            <ScrollText size={18} />
            <div>
              <strong>{o.name}</strong>
              <small>{shortDate(o.dueDate)}截止</small>
            </div>
            <span>{o.dueDate < dateKey() ? '已逾期' : '即将到期'}</span>
          </button>
        ))}
        {upcoming.length === 0 && <p className="muted">暂无即将截止的订单。</p>}
      </div>
    </Sheet>
  );
}
export function ModalHost() {
  const { modal } = useApp();
  if (!modal) return null;
  switch (modal.kind) {
    case 'order':
      return (
        <OrderForm
          key={`order-${modal.id || modal.templateId || modal.counterpartyId || 'new'}`}
          modal={modal}
        />
      );
    case 'task':
      return <TaskForm key={`task-${modal.id || 'new'}`} modal={modal} />;
    case 'folder':
      return <FolderForm key={`folder-${modal.id || 'new'}`} modal={modal} />;
    case 'item':
      return <ItemForm key={`item-${modal.id || 'new'}`} modal={modal} />;
    case 'search':
      return <GlobalSearch />;
    case 'move':
      return <MoveSheet modal={modal} />;
    case 'link':
      return <LinkSheet modal={modal} />;
    case 'create':
      return <CreateSheet modal={modal} />;
    case 'profile':
      return <ProfileSheet />;
    case 'reminders':
      return <RemindersSheet />;
    case 'schedule':
      return <ScheduleForm key={modal.id} id={modal.id} />;
    case 'counterparty':
      return <CounterpartyForm key={modal.id || 'new'} id={modal.id} />;
    case 'counterparty-link':
      return <CounterpartyLink key={modal.id} id={modal.id} />;
    case 'template':
      return (
        <TemplateForm
          key={modal.id || modal.orderId || 'new'}
          id={modal.id}
          orderId={modal.orderId}
        />
      );
    case 'work':
      return <WorkForm key={modal.id || 'new'} id={modal.id} />;
    case 'work-detail':
      return <WorkDetail key={modal.id} id={modal.id} />;
    case 'catalog':
      return <CatalogSheet />;
  }
}
