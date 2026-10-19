import { useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import type { Modal, Order } from '../data/types';
import { STATUSES } from '../data/types';
import { makeOrder, makeTask } from '../data/seed';
import { stamp, stepsFor, uid } from '../data/domain';
import { defaultFlow, feeIsValid, getPlatformColor } from '../data/catalog';
import { attachCounterparty, orderFromTemplate } from '../data/workflow';
import { addDays, dateKey } from '../lib/date';
import { AttachmentInput, Field, FormSection, Sheet } from './common';
import { CatalogSelect, FeeFields } from './CatalogFields';
import { Footer, useDraft } from './FormUtils';

export function OrderEditor({ modal }: { modal: Extract<Modal, { kind: 'order' }> }) {
  const { db, update, setModal, toast } = useApp();
  const old = db.orders.find((o) => o.id === modal.id);
  const t = db.templates.find((t) => t.id === modal.templateId);
  const p = db.counterparties.find((p) => p.id === modal.counterpartyId);
  const initial = old || (t ? orderFromTemplate(t) : makeOrder(db.orderTypes[0]?.name || ''));
  const {
    value: v,
    patch,
    dirty,
  } = useDraft<Order>(!old && p ? attachCounterparty(initial, p) : initial);
  const [templateId, setTemplateId] = useState(modal.templateId || '');
  const [busy, setBusy] = useState(false);
  const input = (
    key: keyof Order,
    label: string,
    type = 'text',
    full = false,
    required = false,
  ) => (
    <Field key={key} label={label} full={full}>
      <input
        type={type}
        required={required}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? '0.01' : undefined}
        value={(v[key] as string | number) ?? ''}
        onChange={(e) =>
          patch({
            ...(key === 'party' ? { counterpartyId: null } : {}),
            [key]:
              type === 'number'
                ? e.target.value === ''
                  ? null
                  : Number(e.target.value)
                : e.target.value,
          })
        }
      />
    </Field>
  );
  function apply(id: string) {
    setTemplateId(id);
    const source = db.templates.find((t) => t.id === id);
    if (!source) return;
    const draft = orderFromTemplate(source);
    patch({
      type: draft.type,
      customType: draft.customType,
      platform: draft.platform,
      platformColor: getPlatformColor(db, draft.platform, draft.platformColor),
      description: draft.description,
      notes: draft.notes,
      steps: draft.steps,
      stage: 0,
      amount: draft.amount,
      platformFeeMode: draft.platformFeeMode,
      platformFee: draft.platformFee,
      cashFlow: draft.cashFlow,
      startDate: source.startDate || v.startDate || dateKey(),
      dueDate:
        source.dueDate || addDays(source.startDate || v.startDate || dateKey(), source.duration),
    });
  }
  function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!v.name.trim() || !v.type.trim()) return toast('请填写订单名称并选择类型');
    if (v.steps.length < 2 || v.steps.some((s) => !s.trim()))
      return toast('请填写至少两个非空进度步骤');
    const start = v.startDate || dateKey(new Date(v.createdAt));
    if (v.dueDate && v.dueDate < start) return toast('截止日期不能早于开始日期');
    if (!feeIsValid(v.amount, v.platformFeeMode, v.platformFee))
      return toast('平台费用不能超过金额，比例应为 0–100%');
    if (v.amount !== null && v.deposit !== null && v.deposit > v.amount)
      return toast('定金不能超过设定金额');
    const history = old
      ? [
          old.status !== v.status ? `状态：${v.status}` : '',
          old.stage !== v.stage ? `进度：${v.steps[v.stage]}` : '',
          old.payment !== v.payment ? `付款：${v.payment}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '创建订单';
    const saved = stamp({
      ...v,
      name: v.name.trim(),
      startDate: start,
      platformColor: getPlatformColor(db, v.platform, v.platformColor),
      history: [
        ...v.history,
        { id: uid(), at: new Date().toISOString(), text: history || '更新订单资料' },
      ],
    });
    const source = !old ? db.templates.find((t) => t.id === templateId) : undefined;
    const tasks =
      source?.tasks.map((n, i) => ({
        ...makeTask(addDays(start, n.offset), v.id),
        name: n.name,
        position: i,
      })) || [];
    update((d) => ({
      ...d,
      orders: old ? d.orders.map((o) => (o.id === v.id ? saved : o)) : [...d.orders, saved],
      tasks: [...d.tasks, ...tasks],
    }));
    setModal(null);
    toast('订单已保存');
  }
  return (
    <Sheet title={old ? '编辑订单' : '新建订单'} dirty={dirty} onClose={() => setModal(null)}>
      <form className="editor-form" onSubmit={save}>
        <FormSection title="基础信息">
          {input('name', '订单名称 *', 'text', true, true)}
          <CatalogSelect
            kind="type"
            label="订单类型"
            value={v.type}
            onChange={(type) =>
              patch({ type, steps: stepsFor(type), stage: 0, cashFlow: defaultFlow(type) })
            }
          />
          {input('number', '订单编号')}
          {v.type === '自定义' && input('customType', '自定义类型名称', 'text', true)}
          <CatalogSelect
            kind="platform"
            label="来源平台"
            value={v.platform}
            full
            onChange={(platform) =>
              patch({ platform, platformColor: getPlatformColor(db, platform) })
            }
          />
          <Field label="创建日期">
            <input
              type="date"
              required
              value={dateKey(new Date(v.createdAt))}
              onChange={(e) => {
                if (e.target.value)
                  patch({ createdAt: new Date(`${e.target.value}T12:00:00`).toISOString() });
              }}
            />
          </Field>
          <Field label="订单描述" full>
            <textarea
              value={v.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
        </FormSection>
        {!old && (
          <FormSection title="选择模板">
            <Field label="应用模板" full>
              <select value={templateId} onChange={(e) => apply(e.target.value)}>
                <option value="">不使用模板</option>
                {db.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            {templateId && (
              <p className="muted small full">模板信息可继续修改，保存时生成任务节点。</p>
            )}
          </FormSection>
        )}
        <FeeFields value={v} onChange={patch} />
        <FormSection title="排期与时间">
          {input('startDate', '开始日期', 'date')}
          {input('dueDate', '约定截止日期', 'date')}
          {input('deliveryDate', '预计交付', 'date')}
          {input('actualDeliveryDate', '实际交付', 'date')}
          {input('shipDate', '发货日期', 'date')}
          {input('receiveDate', '预计收货', 'date')}
          {input('completedDate', '实际完成', 'date')}
          <p className="muted small full">未填写开始日期时，使用最初写入日期。</p>
        </FormSection>
        <FormSection title="交易对象">
          <Field label="关联交易对象档案" full>
            <select
              value={v.counterpartyId || ''}
              onChange={(e) => {
                const p = db.counterparties.find((p) => p.id === e.target.value);
                patch(p ? attachCounterparty(v, p) : { counterpartyId: null });
              }}
            >
              <option value="">手动填写 / 不关联档案</option>
              {db.counterparties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {input('party', '买家 / 卖家 / 委托方', 'text', true)}
          {input('contact', '联系方式')}
          {input('shopUrl', '主页或店铺链接', 'url')}
          <Field label="沟通备注" full>
            <textarea
              value={v.communication}
              onChange={(e) => patch({ communication: e.target.value })}
            />
          </Field>
        </FormSection>
        <FormSection title="付款状态">
          {input('deposit', '定金（元）', 'number')}
          {input('balance', '尾款（元）', 'number')}
          <Field label="付款状态">
            <select value={v.payment} onChange={(e) => patch({ payment: e.target.value })}>
              {['未付款', '已付定金', '已付全款', '部分退款', '已退款'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="退款状态">
            <select value={v.refund} onChange={(e) => patch({ refund: e.target.value })}>
              {['无退款', '退款协商中', '退款中', '部分退款', '已退款'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </FormSection>
        <FormSection title="履约与制作进度">
          <Field label="订单状态">
            <select
              value={v.status}
              onChange={(e) => patch({ status: e.target.value as Order['status'] })}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="当前进度">
            <select value={v.stage} onChange={(e) => patch({ stage: Number(e.target.value) })}>
              {v.steps.map((s, i) => (
                <option key={i} value={i}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="自定义进度步骤" full hint="使用 / 分隔">
            <input
              value={v.steps.join(' / ')}
              onChange={(e) => {
                const steps = e.target.value.split('/').map((s) => s.trim());
                patch({ steps, stage: Math.min(v.stage, steps.length - 1) });
              }}
            />
          </Field>
        </FormSection>
        <FormSection title="附件与资料">
          <AttachmentInput
            value={v.attachments}
            onChange={(attachments) => patch({ attachments })}
            onBusyChange={setBusy}
          />
          <Field label="文字备注" full>
            <textarea value={v.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
          <Field label="外部参考链接" full>
            <textarea value={v.links} onChange={(e) => patch({ links: e.target.value })} />
          </Field>
        </FormSection>
        <Footer busy={busy} />
      </form>
    </Sheet>
  );
}
