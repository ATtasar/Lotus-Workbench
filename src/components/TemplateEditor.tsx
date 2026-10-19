import { useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import { makeTemplate } from '../data/workflow';
import { stamp, stepsFor } from '../data/domain';
import { defaultFlow, feeIsValid, getPlatformColor } from '../data/catalog';
import { dateKey, parseDate } from '../lib/date';
import { Field, FormSection, Sheet } from './common';
import { CatalogSelect, FeeFields } from './CatalogFields';
import { Footer, useDraft } from './FormUtils';

export function TemplateEditor({ id, orderId }: { id?: string; orderId?: string }) {
  const { db, update, setModal, toast, confirm } = useApp();
  const old = db.templates.find((t) => t.id === id);
  const order = db.orders.find((o) => o.id === orderId);
  const initial = old || makeTemplate(order);
  if (!old && order) {
    initial.name = `${order.type}模板`;
    initial.tasks = db.tasks
      .filter((t) => t.orderId === order.id)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        name: t.name,
        offset: Math.max(
          0,
          Math.round(
            (parseDate(t.date).getTime() - parseDate(order.startDate || dateKey()).getTime()) /
              86400000,
          ),
        ),
      }));
  }
  const { value: v, patch, dirty } = useDraft(initial);
  const [steps, setSteps] = useState(initial.steps.join(' / '));
  const [tasks, setTasks] = useState(
    initial.tasks.map((t) => `${t.name} | ${t.offset}`).join('\n'),
  );
  const [source, setSource] = useState('');
  function apply(templateId: string) {
    setSource(templateId);
    const source = db.templates.find((t) => t.id === templateId);
    if (!source) return;
    const { id, createdAt, updatedAt, name, ...fields } = source;
    patch(fields);
    setSteps(source.steps.join(' / '));
    setTasks(source.tasks.map((t) => `${t.name} | ${t.offset}`).join('\n'));
  }
  function save(e: FormEvent) {
    e.preventDefault();
    const flow = steps.split('/').map((s) => s.trim());
    if (!v.name.trim() || !v.type.trim()) return toast('请填写模板名称并选择类型');
    if (flow.length < 2 || flow.some((s) => !s)) return toast('至少填写两个非空进度步骤');
    if (!feeIsValid(v.amount, v.platformFeeMode, v.platformFee))
      return toast('平台费用不能超过金额，比例应为 0–100%');
    if (v.startDate && v.dueDate && v.dueDate < v.startDate)
      return toast('截止日期不能早于开始日期');
    const nodes = tasks
      .split('\n')
      .filter((s) => s.trim())
      .map((s) => {
        const p = s.split('|').map((s) => s.trim());
        return { name: p[0], offset: p.length === 2 && /^\d+$/.test(p[1]) ? Number(p[1]) : NaN };
      });
    if (
      nodes.some((t) => !t.name || !Number.isInteger(t.offset) || t.offset < 0 || t.offset > 3650)
    )
      return toast('任务格式应为：任务名称 | 开始后天数（0–3650）');
    const saved = stamp({
      ...v,
      name: v.name.trim(),
      platformColor: getPlatformColor(db, v.platform, v.platformColor),
      steps: flow,
      tasks: nodes,
    });
    update((d) => ({
      ...d,
      templates: old
        ? d.templates.map((t) => (t.id === saved.id ? saved : t))
        : [...d.templates, saved],
    }));
    setModal(null);
    toast('订单模板已保存');
  }
  return (
    <Sheet
      title={old ? '编辑订单模板' : '新建订单模板'}
      dirty={
        dirty ||
        steps !== initial.steps.join(' / ') ||
        tasks !== initial.tasks.map((t) => `${t.name} | ${t.offset}`).join('\n')
      }
      onClose={() => setModal(null)}
    >
      <form className="editor-form" onSubmit={save}>
        <FormSection title="模板信息">
          <Field label="模板名称 *" full>
            <input required value={v.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <CatalogSelect
            kind="type"
            label="模板订单类型"
            value={v.type}
            onChange={(type) => {
              patch({ type, cashFlow: defaultFlow(type) });
              setSteps(stepsFor(type).join(' / '));
            }}
          />
          <Field label="默认工期（天）">
            <input
              required
              type="number"
              min="0"
              max="3650"
              value={v.duration}
              onChange={(e) => patch({ duration: Number(e.target.value) })}
            />
          </Field>
          {v.type === '自定义' && (
            <Field label="自定义类型名称" full>
              <input value={v.customType} onChange={(e) => patch({ customType: e.target.value })} />
            </Field>
          )}
          <CatalogSelect
            kind="platform"
            label="默认平台"
            full
            value={v.platform}
            onChange={(platform) =>
              patch({ platform, platformColor: getPlatformColor(db, platform) })
            }
          />
          <Field label="默认需求描述" full>
            <textarea
              value={v.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Field label="默认备注" full>
            <textarea value={v.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
        </FormSection>
        <FormSection title="选择模板">
          <Field
            label="选择已有模板"
            full
            hint="保留当前模板名称，将所选模板的字段和流程复制到此处。"
          >
            <select value={source} onChange={(e) => apply(e.target.value)}>
              <option value="">不复制其他模板</option>
              {db.templates
                .filter((t) => t.id !== v.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
        </FormSection>
        <FeeFields value={v} onChange={patch} />
        <FormSection title="排期日期">
          <Field label="排期开始日期">
            <input
              type="date"
              value={v.startDate}
              onChange={(e) => patch({ startDate: e.target.value })}
            />
          </Field>
          <Field label="排期截止日期">
            <input
              type="date"
              value={v.dueDate}
              onChange={(e) => patch({ dueDate: e.target.value })}
            />
          </Field>
          <p className="muted small full">
            留空时，创建订单使用写入当天作为开始日期，并按默认工期计算截止日期。
          </p>
        </FormSection>
        <FormSection title="流程与任务">
          <Field label="进度步骤 *" full hint="使用 / 分隔">
            <input required value={steps} onChange={(e) => setSteps(e.target.value)} />
          </Field>
          <Field
            label="默认任务节点"
            full
            hint="每行一项，格式：草稿确认 | 2。数字为开始后的天数。"
          >
            <textarea rows={5} value={tasks} onChange={(e) => setTasks(e.target.value)} />
          </Field>
        </FormSection>
        <Footer />
        {old && (
          <button
            type="button"
            className="delete-wide"
            onClick={() =>
              confirm('删除订单模板？', '已创建的订单与任务保留。', () => {
                update((d) => ({ ...d, templates: d.templates.filter((t) => t.id !== id) }));
                setModal(null);
                toast('模板已删除');
              })
            }
          >
            删除订单模板
          </button>
        )}
      </form>
    </Sheet>
  );
}
