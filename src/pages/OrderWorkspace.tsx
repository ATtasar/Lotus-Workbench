import { CalendarBoard } from '../components/CalendarBoard';
import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Files,
  Images,
  LayoutTemplate,
  ListOrdered,
  Plus,
  UsersRound,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { calendarEvents } from '../data/domain';
import { moveQueue } from '../data/workflow';
import { addDays, dateKey, parseDate, shiftMonth, shortDate } from '../lib/date';
import { DateGrid, EventRow } from '../components/CalendarParts';
import { Empty, ItemArt, PageHeader, Progress, SearchInput } from '../components/common';
import { OrderList } from './Orders';

const sections = [
  { id: 'queue', label: '项目排单', icon: ListOrdered },
  { id: 'list', label: '订单整理', icon: Files },
  { id: 'calendar', label: '订单日历', icon: CalendarDays },
  { id: 'parties', label: '交易对象', icon: UsersRound },
  { id: 'templates', label: '订单模板', icon: LayoutTemplate },
  { id: 'gallery', label: '作品画廊', icon: Images },
] as const;
type Section = (typeof sections)[number]['id'];

export function OrderWorkspace() {
  const { db, setModal } = useApp();
  const [section, setSection] = useState<Section>('queue');
  const current = sections.find((s) => s.id === section)!;
  const create = () =>
    setModal(
      section === 'parties'
        ? { kind: 'counterparty' }
        : section === 'templates'
          ? { kind: 'template' }
          : section === 'gallery'
            ? { kind: 'work' }
            : { kind: 'order' },
    );
  const active = db.orders.filter((o) => !o.archived && o.status !== '已完成').length;
  return (
    <main className="page orders-workspace">
      <PageHeader title="订单" onAdd={create} />
      <div className="workspace-caption">
        <span>项目与订单管理</span>
        <span>{active} 项进行中</span>
      </div>
      <div className="workspace-modules" role="tablist" aria-label="订单工作区模块">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-controls={`panel-${id}`}
            aria-selected={section === id}
            className={section === id ? 'active' : ''}
            onClick={() => setSection(id)}
          >
            <Icon size={20} strokeWidth={1.5} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="workspace-section-heading">
        <h2>{current.label}</h2>
        <span>{String(sections.findIndex((s) => s.id === section) + 1).padStart(2, '0')} / 06</span>
      </div>
      <div id={`panel-${section}`} role="tabpanel" aria-labelledby={`tab-${section}`} key={section}>
        {section === 'queue' ? (
          <ProjectQueue />
        ) : section === 'list' ? (
          <OrderList />
        ) : section === 'calendar' ? (
          <OrderCalendar />
        ) : section === 'parties' ? (
          <Counterparties />
        ) : section === 'templates' ? (
          <Templates />
        ) : (
          <Gallery />
        )}
      </div>
    </main>
  );
}

function ProjectQueue() {
  const { db, update, navigate, setModal, toast } = useApp();
  const [sort, setSort] = useState('queue');
  const [query, setQuery] = useState('');
  const queue = db.orders
    .filter((o) => !o.archived && o.status !== '已完成')
    .sort((a, b) =>
      sort === 'due'
        ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
        : a.queuePosition - b.queuePosition || a.createdAt.localeCompare(b.createdAt),
    );
  const shown = queue.filter((o) =>
    `${o.name} ${o.party} ${o.platform}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="queue-toolbar">
        <span>{queue.length} 个待处理 / 进行中项目</span>
        <select aria-label="排单排序方式" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="queue">排单顺序</option>
          <option value="due">截止日期</option>
        </select>
      </div>
      <SearchInput value={query} onChange={setQuery} placeholder="搜索项目、交易对象、平台…" />
      <div className="queue-list">
        {shown.map((o) => {
          const index = queue.findIndex((q) => q.id === o.id);
          const tasks = db.tasks.filter((t) => t.orderId === o.id);
          return (
            <article className="queue-card" key={o.id}>
              <div className="queue-card-top">
                <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="queue-type">{o.type}</span>
                <span className="queue-status">{o.status}</span>
              </div>
              <button
                className="queue-open"
                onClick={() => navigate({ page: 'orders', detail: 'order', id: o.id })}
              >
                <h3>{o.name}</h3>
                <ArrowUpRight size={20} />
              </button>
              <p className="queue-meta">
                {o.party || '未填写对象'}
                <span> / </span>
                {o.platform || '未填写平台'}
              </p>
              <div className="queue-date-row">
                <span>
                  {o.startDate ? shortDate(o.startDate) : '开始未定'} —{' '}
                  {o.dueDate ? shortDate(o.dueDate) : '截止未定'}
                </span>
                {o.dueDate && o.dueDate < dateKey() && <b>已逾期</b>}
              </div>
              <Progress order={o} />
              <div className="queue-card-footer">
                <span>
                  {tasks.filter((t) => t.done).length} / {tasks.length} 任务已完成
                </span>
                <div>
                  <button
                    className="text-button"
                    aria-label={`调整${o.name}排期`}
                    onClick={() => setModal({ kind: 'schedule', id: o.id })}
                  >
                    <CalendarDays size={14} />
                    调整排期
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`上移项目${o.name}`}
                    disabled={sort !== 'queue' || index === 0}
                    onClick={() => {
                      update((d) => moveQueue(d, o.id, -1));
                      toast('排单顺序已更新');
                    }}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`下移项目${o.name}`}
                    disabled={sort !== 'queue' || index === queue.length - 1}
                    onClick={() => {
                      update((d) => moveQueue(d, o.id, 1));
                      toast('排单顺序已更新');
                    }}
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && (
        <Empty
          title="暂无项目"
          description="新建订单后可调整项目排期和顺序。"
          label="新建订单"
          action={() => setModal({ kind: 'order' })}
        />
      )}
    </>
  );
}

function OrderCalendar() {
  return <CalendarBoard scope="orders" />;
}

function Counterparties() {
  const { db, setModal } = useApp();
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const parties = db.counterparties.filter(
    (p) =>
      `${p.name} ${p.platform} ${p.contact} ${p.notes}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!platform || p.platform === platform),
  );
  return (
    <>
      <SearchInput value={query} onChange={setQuery} placeholder="搜索对象、平台、联系方式…" />
      <div className="queue-toolbar">
        <span>{parties.length} 个交易对象</span>
        <select
          aria-label="对象来源平台"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="">全部平台</option>
          {[...new Set(db.counterparties.map((p) => p.platform).filter(Boolean))].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="counterparty-list">
        {parties.map((p) => {
          const orders = db.orders.filter((o) => o.counterpartyId === p.id);
          return (
            <button
              className="counterparty-card"
              key={p.id}
              onClick={() => setModal({ kind: 'counterparty', id: p.id })}
            >
              <span className="counterparty-monogram">{p.name.slice(0, 1)}</span>
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.platform || '未填写平台'} · {p.role}
                </small>
                <span>
                  {orders.length} 笔关联订单
                  {orders.some((o) => !o.archived && o.status !== '已完成')
                    ? ` · ${orders.filter((o) => !o.archived && o.status !== '已完成').length} 笔进行中`
                    : ''}
                </span>
              </div>
              <ChevronRight size={17} />
            </button>
          );
        })}
      </div>
      {!parties.length && (
        <Empty
          title="暂无交易对象"
          label="新建交易对象"
          action={() => setModal({ kind: 'counterparty' })}
        />
      )}
    </>
  );
}

function Templates() {
  const { db, setModal, confirm, update, toast } = useApp();
  const [query, setQuery] = useState('');
  const templates = db.templates.filter((t) => `${t.name} ${t.type}`.includes(query));
  return (
    <>
      <p className="workspace-instruction">保存常用字段、流程步骤与任务节点，创建订单时应用。</p>
      <SearchInput value={query} onChange={setQuery} placeholder="搜索模板名称、类型…" />
      <div className="template-list">
        {templates.map((t) => (
          <article className="template-card" key={t.id}>
            <div className="template-card-top">
              <span>
                <LayoutTemplate size={18} />
                {t.type}
              </span>
              <span>{t.duration} 天工期</span>
            </div>
            <h3>{t.name}</h3>
            <p>{t.steps.join(' → ')}</p>
            <div className="template-task-count">{t.tasks.length} 个默认任务节点</div>
            <div className="template-card-actions">
              <button
                className="text-button"
                onClick={() => setModal({ kind: 'template', id: t.id })}
              >
                编辑
              </button>
              <button
                className="text-button"
                onClick={() =>
                  confirm('删除订单模板？', '已创建的订单与任务保留。', () => {
                    update((d) => ({ ...d, templates: d.templates.filter((x) => x.id !== t.id) }));
                    toast('模板已删除');
                  })
                }
              >
                删除
              </button>
              <button
                className="primary"
                onClick={() => setModal({ kind: 'order', templateId: t.id })}
              >
                使用模板
                <ArrowUpRight size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!templates.length && (
        <Empty
          title="暂无订单模板"
          label="新建模板"
          action={() => setModal({ kind: 'template' })}
        />
      )}
    </>
  );
}

function Gallery() {
  const { db, setModal } = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const works = db.works
    .filter(
      (w) =>
        (category === '全部' || w.category === category) &&
        `${w.name} ${w.description} ${w.tags.join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
  return (
    <>
      <SearchInput value={query} onChange={setQuery} placeholder="搜索作品名称、标签…" />
      <div className="filter-tabs gallery-filters">
        {['全部', '插画', '手作', '产品', '其他'].map((c) => (
          <button className={category === c ? 'active' : ''} key={c} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="gallery-caption">
        <span>{works.length} 件作品</span>
        <span>插画 / 手作 / 产品</span>
      </div>
      <div className="work-grid">
        {works.map((w) => (
          <button
            className="work-card"
            key={w.id}
            onClick={() => setModal({ kind: 'work-detail', id: w.id })}
          >
            <div className="work-media">
              <ItemArt item={w} />
              <span>{w.category}</span>
            </div>
            <div className="work-card-caption">
              <h3>{w.name}</h3>
              <ArrowUpRight size={16} />
            </div>
            <small>{w.date || '未设置日期'}</small>
          </button>
        ))}
      </div>
      {!works.length && (
        <Empty
          title="暂无作品"
          description="添加插画、手作或产品图片与说明。"
          label="添加作品"
          action={() => setModal({ kind: 'work' })}
        />
      )}
    </>
  );
}
