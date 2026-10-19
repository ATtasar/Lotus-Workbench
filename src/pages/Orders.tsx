import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Link2,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { calendarEvents, deleteOrder, stamp, uid } from '../data/domain';
import { ORDER_TYPES, STATUSES, type Order, type Task } from '../data/types';
import { dateKey, money, shortDate } from '../lib/date';
import {
  AttachmentGallery,
  DetailHeader,
  Empty,
  Info,
  ItemArt,
  PageHeader,
  Progress,
  SafeLink,
  SearchInput,
  SectionTitle,
} from '../components/common';
import { EventRow } from '../components/CalendarParts';
import { feeAmount, netAmount } from '../data/catalog';

export function OrderList() {
  const { db, setModal, navigate } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('全部');
  const [type, setType] = useState('全部类型');
  const [party, setParty] = useState('');
  const [sort, setSort] = useState('due');
  const [filters, setFilters] = useState(false);
  const orders = db.orders
    .filter(
      (o) =>
        (status === '已归档'
          ? o.archived
          : !o.archived && (status === '全部' || o.status === status)) &&
        (type === '全部类型' || o.type === type) &&
        (!party || o.party === party) &&
        `${o.name} ${o.number} ${o.party}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'due'
        ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
        : b.createdAt.localeCompare(a.createdAt),
    );
  const activeCount = db.orders.filter((o) => !o.archived && o.status !== '已完成').length;
  return (
    <section className="order-organizer" aria-label="订单整理内容">
      <SearchInput value={query} onChange={setQuery} placeholder="搜索订单、编号、交易对象…" />
      <div className="filter-tabs" aria-label="订单状态筛选">
        {['全部', ...STATUSES, '已归档'].map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="list-toolbar">
        <span>{orders.length} 笔订单</span>
        <div>
          <button
            className="text-button"
            onClick={() => setSort((s) => (s === 'due' ? 'created' : 'due'))}
          >
            <ArrowDownUp size={14} />
            {sort === 'due' ? '截止日期' : '创建时间'}
          </button>
          <button
            className={`text-button ${filters || type !== '全部类型' || party ? 'accent' : ''}`}
            onClick={() => setFilters((v) => !v)}
          >
            <SlidersHorizontal size={15} />
            筛选
          </button>
        </div>
      </div>
      {filters && (
        <div className="filter-panel">
          <label>
            订单类型
            <select aria-label="订单类型" value={type} onChange={(e) => setType(e.target.value)}>
              <option>全部类型</option>
              {[
                ...new Set([...db.orderTypes.map((t) => t.name), ...db.orders.map((o) => o.type)]),
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            交易对象
            <select aria-label="交易对象" value={party} onChange={(e) => setParty(e.target.value)}>
              <option value="">全部对象</option>
              {[...new Set(db.orders.map((o) => o.party).filter(Boolean))].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              setType('全部类型');
              setParty('');
              setQuery('');
              setStatus('全部');
            }}
          >
            重置筛选
          </button>
        </div>
      )}
      <div className="order-list">
        {orders.map((o) => (
          <button
            className="paper order-card"
            key={o.id}
            onClick={() => navigate({ page: 'orders', detail: 'order', id: o.id })}
          >
            <div className="order-card-top">
              <span className="tag">{o.type === '自定义' ? o.customType || o.type : o.type}</span>
              <span className={`status-tag ${o.status === '已完成' ? 'finished' : ''}`}>
                {o.archived ? '已归档' : o.status}
              </span>
            </div>
            <h2>{o.name}</h2>
            <p>
              {o.number || '未填写编号'}
              <span>·</span>
              {o.party || '未填写交易对象'}
              {o.platform && (
                <>
                  <span>·</span>
                  {o.platform}
                </>
              )}
            </p>
            <Progress order={o} />
            <div className="order-card-bottom">
              <span>{o.dueDate ? `${shortDate(o.dueDate)}截止` : '未设置截止日'}</span>
              <ChevronRight size={16} />
            </div>
          </button>
        ))}
      </div>
      {orders.length === 0 && (
        <Empty
          title="这里还没有订单"
          description="可以调整筛选条件，或记下新的委托与交易。"
          label="新建订单"
          action={() => setModal({ kind: 'order' })}
        />
      )}
    </section>
  );
}
export function OrderDetail({ id }: { id: string }) {
  const { db, update, setModal, confirm, navigate, toast, back } = useApp();
  const order = db.orders.find((o) => o.id === id);
  if (!order)
    return (
      <main className="page">
        <DetailHeader title="订单详情" />
        <Empty title="这笔订单已不存在" action={back} label="返回" />
      </main>
    );
  const tasks = db.tasks.filter((t) => t.orderId === id).sort((a, b) => a.position - b.position);
  const linkedIds = new Set(db.links.filter((l) => l.orderId === id).map((l) => l.itemId));
  const items = db.items.filter((i) => linkedIds.has(i.id));
  function change(patch: Partial<Order>, text: string) {
    update((d) => ({
      ...d,
      orders: d.orders.map((o) =>
        o.id === id
          ? stamp({
              ...o,
              ...patch,
              history: [...o.history, { id: uid(), at: new Date().toISOString(), text }],
            })
          : o,
      ),
    }));
    toast('订单已更新');
  }
  function reorder(task: Task, delta: number) {
    const index = tasks.findIndex((t) => t.id === task.id);
    const next = index + delta;
    if (next < 0 || next >= tasks.length) return;
    const reordered = [...tasks];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    update((d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.orderId === id ? stamp({ ...t, position: reordered.findIndex((x) => x.id === t.id) }) : t,
      ),
    }));
  }
  const taskEvents = calendarEvents(db);
  return (
    <main className="page detail-page">
      <DetailHeader title="订单档案" onEdit={() => setModal({ kind: 'order', id })} />
      <div className="detail-title">
        <div className="tag-row">
          <span className="tag">
            {order.type === '自定义' ? order.customType || order.type : order.type}
          </span>
          {order.archived && <span className="tag">已归档</span>}
        </div>
        <h1>{order.name}</h1>
        <p>
          {order.number || '未填写编号'}
          <span>·</span>
          {order.platform || '未填写来源平台'}
        </p>
      </div>
      <section className="paper detail-section">
        <div className="section-title">
          <h2>
            履约进度
            <i />
          </h2>
          <select
            className="inline-select"
            aria-label="订单状态"
            value={order.status}
            onChange={(e) =>
              change({ status: e.target.value as Order['status'] }, `状态更新：${e.target.value}`)
            }
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <Progress order={order} />
        <div className="stage-buttons">
          {order.steps.map((step, i) => (
            <button
              key={i}
              className={order.stage === i ? 'active' : ''}
              onClick={() => change({ stage: i }, `进度更新：${step}`)}
            >
              {step}
            </button>
          ))}
        </div>
        <p className="muted small">制作进度、付款与任务完成状态分别记录。</p>
      </section>
      <section className="paper detail-section">
        <SectionTitle
          title="任务与节点"
          label="添加任务"
          onClick={() => setModal({ kind: 'task', orderId: id })}
        />
        {tasks.length ? (
          tasks.map((task, i) => {
            const event = taskEvents.find((e) => e.taskId === task.id) || {
              id: task.id,
              name: task.name,
              date: task.date,
              time: task.time,
              done: task.done,
              source: 'task' as const,
              orderId: id,
              taskId: task.id,
              reminder: task.reminder,
            };
            return (
              <div className="order-task" key={task.id}>
                <div className="task-date-label">{shortDate(task.date)}</div>
                <EventRow event={event} />
                <div className="task-sort">
                  <button
                    aria-label={`上移${task.name}`}
                    disabled={i === 0}
                    onClick={() => reorder(task, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    aria-label={`下移${task.name}`}
                    disabled={i === tasks.length - 1}
                    onClick={() => reorder(task, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
                {task.notes && <p className="muted small">{task.notes}</p>}
              </div>
            );
          })
        ) : (
          <p className="muted">还没有任务，添加节点让进度更清晰。</p>
        )}
      </section>
      <section className="paper detail-section">
        <SectionTitle title="交易与对象" />
        <Info label="交易对象" value={order.party} />
        {order.counterpartyId && (
          <button
            className="text-button"
            onClick={() => setModal({ kind: 'counterparty', id: order.counterpartyId! })}
          >
            查看对象档案
            <ChevronRight size={14} />
          </button>
        )}
        <Info label="联系方式" value={order.contact} />
        {order.shopUrl && <Info label="主页 / 店铺" value={<SafeLink href={order.shopUrl} />} />}
        <Info label="订单金额" value={money(order.amount)} />
        <Info
          label="平台费用"
          value={money(feeAmount(order.amount, order.platformFeeMode, order.platformFee))}
        />
        <Info
          label="实际金额（扣除平台费）"
          value={money(netAmount(order.amount, order.platformFeeMode, order.platformFee))}
        />
        <Info label="定金 / 尾款" value={`${money(order.deposit)} / ${money(order.balance)}`} />
        <Info label="付款状态" value={<span className="accent">{order.payment}</span>} />
        <Info label="退款状态" value={order.refund} />
        {order.communication && <p className="body-copy">{order.communication}</p>}
      </section>
      <section className="paper detail-section">
        <SectionTitle title="时间档案" />
        {(
          [
            ['startDate', '开始日期'],
            ['dueDate', '约定截止'],
            ['deliveryDate', '预计交付'],
            ['actualDeliveryDate', '实际交付'],
            ['shipDate', '发货日期'],
            ['receiveDate', '预计收货'],
            ['completedDate', '实际完成'],
          ] as const
        ).map(([key, label]) => (
          <Info key={key} label={label} value={order[key] || '未设置'} />
        ))}
        <Info label="创建日期" value={dateKey(new Date(order.createdAt))} />
      </section>
      <section className="paper detail-section">
        <SectionTitle title="需求与资料" />
        <p className="body-copy">{order.description || '还没有填写需求描述。'}</p>
        <AttachmentGallery value={order.attachments} />
        {order.notes && <p className="note-block">{order.notes}</p>}
        {order.links
          .split('\n')
          .filter(Boolean)
          .map((href, i) => (
            <SafeLink key={i} href={href.trim()} />
          ))}
      </section>
      <section className="paper detail-section">
        <SectionTitle
          title="关联收纳"
          label="关联物品"
          onClick={() => setModal({ kind: 'link', entity: 'order', id })}
        />
        {items.length ? (
          items.map((item) => (
            <div className="linked-row" key={item.id}>
              <button onClick={() => navigate({ page: 'storage', detail: 'item', id: item.id })}>
                <ItemArt item={item} />
                <span>{item.name}</span>
                <ChevronRight size={16} />
              </button>
              <button
                className="text-button small"
                onClick={() => {
                  update((d) => ({
                    ...d,
                    links: d.links.filter((l) => !(l.orderId === id && l.itemId === item.id)),
                  }));
                  toast('已取消关联，物品仍保留');
                }}
              >
                取消关联
              </button>
            </div>
          ))
        ) : (
          <p className="muted">可以关联多个已有物品，分别记录它们的收藏档案。</p>
        )}
      </section>
      <section className="paper detail-section history">
        <SectionTitle title="变化记录" />
        {[...order.history].reverse().map((h) => (
          <div key={h.id}>
            <i />
            <p>
              {h.text}
              <small>{new Date(h.at).toLocaleString('zh-CN', { hour12: false })}</small>
            </p>
          </div>
        ))}
      </section>
      <div className="detail-actions">
        <button className="secondary" onClick={() => setModal({ kind: 'template', orderId: id })}>
          保存为模板
        </button>
        <button
          className="secondary"
          onClick={() =>
            change({ archived: !order.archived }, order.archived ? '从归档恢复' : '归档订单')
          }
        >
          {order.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}{' '}
          {order.archived ? '恢复订单' : '归档订单'}
        </button>
        <button
          className="secondary danger-text"
          onClick={() =>
            confirm(
              '删除这笔订单？',
              `「${order.name}」及其 ${tasks.length} 个任务将删除。关联物品会保留。`,
              () => {
                update((d) => deleteOrder(d, id));
                navigate({ page: 'orders' });
                toast('订单已删除');
              },
            )
          }
        >
          <Trash2 size={17} />
          删除订单
        </button>
      </div>
    </main>
  );
}
