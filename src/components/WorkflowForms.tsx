import { useState, type FormEvent } from 'react';
import { ChevronRight, Link2 } from 'lucide-react';
import { useApp } from '../state/AppContext';
import type { Work } from '../data/types';
import { stamp } from '../data/domain';
import { attachCounterparty, historyEntry, makeWork } from '../data/workflow';
import {
  AttachmentGallery,
  AttachmentInput,
  Empty,
  Field,
  FormSection,
  ItemArt,
  SearchInput,
  Sheet,
} from './common';
import { Footer, useDraft } from './FormUtils';

export function ScheduleForm({ id }: { id: string }) {
  const { db, update, setModal, toast } = useApp();
  const order = db.orders.find((o) => o.id === id);
  const [start, setStart] = useState(order?.startDate || '');
  const [due, setDue] = useState(order?.dueDate || '');
  function save(e: FormEvent) {
    e.preventDefault();
    if (!order) return;
    if (start && due && due < start) return toast('截止日期不能早于开始日期');
    update((d) => ({
      ...d,
      orders: d.orders.map((o) =>
        o.id === id
          ? stamp({
              ...o,
              startDate: start,
              dueDate: due,
              history: [
                ...o.history,
                historyEntry(`调整排期：${start || '未设置'} 至 ${due || '未设置'}`),
              ],
            })
          : o,
      ),
    }));
    setModal(null);
    toast('排期已更新');
  }
  return (
    <Sheet
      title="调整项目排期"
      dirty={start !== order?.startDate || due !== order?.dueDate}
      onClose={() => setModal(null)}
    >
      <form className="editor-form" onSubmit={save}>
        <p className="form-context">{order?.name}</p>
        <FormSection title="排期日期">
          <Field label="开始日期">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="截止日期">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <p className="muted small full">
            调整订单日期不会更改独立任务的截止日期。任务节点可在订单详情中编辑。
          </p>
        </FormSection>
        <Footer />
      </form>
    </Sheet>
  );
}

export { CounterpartyPanel as CounterpartyForm } from './CounterpartyPanel';
export function CounterpartyLink({ id }: { id: string }) {
  const { db, update, setModal, toast } = useApp();
  const party = db.counterparties.find((p) => p.id === id);
  const [selected, setSelected] = useState(
    () => new Set(db.orders.filter((o) => o.counterpartyId === id).map((o) => o.id)),
  );
  const [query, setQuery] = useState('');
  function save() {
    if (!party) return;
    update((d) => ({
      ...d,
      orders: d.orders.map((o) =>
        selected.has(o.id)
          ? stamp(attachCounterparty(o, party))
          : o.counterpartyId === id
            ? stamp({ ...o, counterpartyId: null })
            : o,
      ),
    }));
    setModal({ kind: 'counterparty', id });
    toast('订单关联已更新');
  }
  return (
    <Sheet title="关联对象与订单" onClose={() => setModal({ kind: 'counterparty', id })}>
      <div className="sheet-body">
        <p className="muted">
          选择关联至「{party?.name}」的订单。每笔订单关联一个对象档案，原有关联将被替换。
        </p>
        <SearchInput value={query} onChange={setQuery} placeholder="搜索订单名称…" />
        <div className="selection-list">
          {db.orders
            .filter((o) => o.name.includes(query))
            .map((o) => (
              <button
                key={o.id}
                aria-pressed={selected.has(o.id)}
                className={selected.has(o.id) ? 'selected' : ''}
                onClick={() =>
                  setSelected((old) => {
                    const next = new Set(old);
                    next.has(o.id) ? next.delete(o.id) : next.add(o.id);
                    return next;
                  })
                }
              >
                <span>
                  {o.name}
                  {o.counterpartyId && o.counterpartyId !== id ? ` · 当前：${o.party}` : ''}
                </span>
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </button>
            ))}
        </div>
        <button className="primary wide" onClick={save}>
          保存关联
        </button>
      </div>
    </Sheet>
  );
}

export { TemplateEditor as TemplateForm } from './TemplateEditor';
export function WorkForm({ id }: { id?: string }) {
  const { db, update, setModal, toast, confirm } = useApp();
  const old = db.works.find((w) => w.id === id);
  const { value: v, patch, dirty } = useDraft<Work>(old || makeWork());
  const [busy, setBusy] = useState(false);
  function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!v.name.trim()) return toast('请填写作品名称');
    const saved = stamp({ ...v, name: v.name.trim(), tags: v.tags.filter(Boolean) });
    update((d) => ({
      ...d,
      works: old ? d.works.map((w) => (w.id === saved.id ? saved : w)) : [...d.works, saved],
    }));
    setModal(null);
    toast('作品已保存');
  }
  return (
    <Sheet title={old ? '编辑作品' : '添加作品'} dirty={dirty} onClose={() => setModal(null)}>
      <form className="editor-form" onSubmit={save}>
        <FormSection title="作品资料">
          <Field label="作品名称 *" full>
            <input
              required
              maxLength={150}
              value={v.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="作品分类">
            <select
              value={v.category}
              onChange={(e) => patch({ category: e.target.value as Work['category'] })}
            >
              {['插画', '手作', '产品', '其他'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="作品日期">
            <input type="date" value={v.date} onChange={(e) => patch({ date: e.target.value })} />
          </Field>
          <AttachmentInput
            value={v.attachments}
            imagesOnly
            onBusyChange={setBusy}
            onChange={(attachments) => patch({ attachments })}
          />
          {v.illustration && (
            <button
              type="button"
              className="text-button full"
              onClick={() => patch({ illustration: '' })}
            >
              移除示例插画
            </button>
          )}
          <Field label="作品说明" full>
            <textarea
              value={v.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Field label="作品标签" full hint="使用逗号分隔">
            <input
              value={v.tags.join('，')}
              onChange={(e) => patch({ tags: e.target.value.split(/[,，]/).map((t) => t.trim()) })}
            />
          </Field>
          <Field label="关联订单" full>
            <select
              value={v.orderId || ''}
              onChange={(e) => patch({ orderId: e.target.value || null })}
            >
              <option value="">不关联订单</option>
              {db.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        </FormSection>
        <Footer busy={busy} />
        {old && (
          <button
            type="button"
            className="delete-wide"
            onClick={() =>
              confirm('删除作品？', '作品图片与说明将删除，关联订单会保留。', () => {
                update((d) => ({ ...d, works: d.works.filter((w) => w.id !== id) }));
                setModal(null);
                toast('作品已删除');
              })
            }
          >
            删除作品
          </button>
        )}
      </form>
    </Sheet>
  );
}

export function WorkDetail({ id }: { id: string }) {
  const { db, setModal, navigate } = useApp();
  const work = db.works.find((w) => w.id === id);
  const order = db.orders.find((o) => o.id === work?.orderId);
  return (
    <Sheet title="作品档案" onClose={() => setModal(null)}>
      <div className="sheet-body">
        {work ? (
          <>
            <div className="work-detail-media">
              <ItemArt item={work} />
            </div>
            <div className="work-detail-heading">
              <div>
                <span className="muted small">
                  {work.category} · {work.date || '未设置日期'}
                </span>
                <h2>{work.name}</h2>
              </div>
              <button className="secondary" onClick={() => setModal({ kind: 'work', id })}>
                编辑
              </button>
            </div>
            {work.description && <p className="body-copy">{work.description}</p>}
            <div className="tag-row">
              {work.tags.map((t, i) => (
                <span className="tag" key={i}>
                  {t}
                </span>
              ))}
            </div>
            <AttachmentGallery value={work.attachments} />
            {order && (
              <button
                className="workspace-link-row"
                onClick={() => {
                  setModal(null);
                  navigate({ page: 'orders', detail: 'order', id: order.id });
                }}
              >
                <Link2 size={16} />
                <span>{order.name}</span>
                <ChevronRight size={16} />
              </button>
            )}
          </>
        ) : (
          <Empty title="作品已不存在" />
        )}
      </div>
    </Sheet>
  );
}
