import { useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import { makeFolder, makeItem, makeTask } from '../data/seed';
import { canMoveFolder, folderPath, stamp } from '../data/domain';
import type { Folder, Item, Modal, Task } from '../data/types';
import { AttachmentInput, Field, FormSection, ReviewFields, Sheet, Toggle } from './common';
import { dateKey, defaultReminder } from '../lib/date';
import { CatalogSelect } from './CatalogFields';
import { getPlatformColor } from '../data/catalog';

export { Footer, useDraft } from './FormUtils';
import { Footer, useDraft } from './FormUtils';
export { OrderEditor as OrderForm } from './OrderEditor';
export function TaskForm({ modal }: { modal: Extract<Modal, { kind: 'task' }> }) {
  const { db, update, setModal, toast, confirm } = useApp();
  const old = db.tasks.find((t) => t.id === modal.id);
  const {
    value: v,
    patch,
    dirty,
  } = useDraft<Task>(old ?? makeTask(modal.date || dateKey(), modal.orderId || null));
  function dateChange(next: Partial<Task>) {
    const merged = { ...v, ...next };
    patch({
      ...next,
      reminder: {
        ...v.reminder,
        at: v.reminder.enabled
          ? defaultReminder(merged.date, merged.time, db.settings.reminderMinutes)
          : v.reminder.at,
      },
    });
  }
  function save(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return toast('请填写任务名称');
    if (v.reminder.enabled && !v.reminder.at) return toast('请选择提醒日期与时间');
    const saved = stamp({ ...v, name: v.name.trim() });
    update((d) => ({
      ...d,
      tasks: old ? d.tasks.map((t) => (t.id === v.id ? saved : t)) : [...d.tasks, saved],
    }));
    setModal(null);
    toast('任务已保存，日历已同步');
  }
  return (
    <Sheet title={old ? '编辑任务' : '新建任务'} dirty={dirty} onClose={() => setModal(null)}>
      <form className="editor-form" onSubmit={save}>
        <FormSection title="任务信息">
          <Field label="任务名称 *" full>
            <input
              required
              maxLength={200}
              value={v.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="关联订单" full>
            <select
              value={v.orderId || ''}
              onChange={(e) => patch({ orderId: e.target.value || null })}
            >
              <option value="">个人任务 · 不关联订单</option>
              {db.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.archived ? '（已归档）' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="日期 *">
            <input
              type="date"
              required
              value={v.date}
              onChange={(e) => dateChange({ date: e.target.value })}
            />
          </Field>
          <Field label="时间 · 选填">
            <input
              type="time"
              value={v.time}
              onChange={(e) => dateChange({ time: e.target.value })}
            />
          </Field>
          <Field label="备注" full>
            <textarea value={v.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
          <div className="switch-row full">
            <div>
              <strong>标记为已完成</strong>
              <small>完成状态会同步到日历与订单</small>
            </div>
            <Toggle label="任务完成状态" checked={v.done} onChange={(done) => patch({ done })} />
          </div>
        </FormSection>
        <FormSection title="应用内提醒">
          <div className="switch-row full">
            <div>
              <strong>提醒我</strong>
              <small>仅在应用打开时显示到期提醒</small>
            </div>
            <Toggle
              label="开启任务提醒"
              checked={v.reminder.enabled}
              onChange={(enabled) =>
                patch({
                  reminder: {
                    enabled,
                    at:
                      v.reminder.at || defaultReminder(v.date, v.time, db.settings.reminderMinutes),
                  },
                })
              }
            />
          </div>
          {v.reminder.enabled && (
            <Field label="提醒日期与时间 *" full>
              <input
                type="datetime-local"
                required
                value={v.reminder.at}
                onChange={(e) => patch({ reminder: { ...v.reminder, at: e.target.value } })}
              />
            </Field>
          )}
        </FormSection>
        <Footer />
        {old && (
          <button
            type="button"
            className="delete-wide"
            onClick={() =>
              confirm('删除这条任务？', '关联订单会保留，日历中此任务会被移除。', () => {
                update((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== old.id) }));
                setModal(null);
                toast('任务已删除');
              })
            }
          >
            删除任务
          </button>
        )}
      </form>
    </Sheet>
  );
}
export function FolderForm({ modal }: { modal: Extract<Modal, { kind: 'folder' }> }) {
  const { db, update, setModal, toast } = useApp();
  const [uploading, setUploading] = useState(false);
  const old = db.folders.find((f) => f.id === modal.id);
  const { value: v, patch, dirty } = useDraft<Folder>(old ?? makeFolder(modal.parentId || null));
  const input = (key: keyof Folder, label: string, type = 'text') => (
    <Field key={key} label={label}>
      <input
        type={type}
        value={v[key] as string}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
    </Field>
  );
  function save(e: FormEvent) {
    e.preventDefault();
    if (uploading) return toast('封面正在读取，请稍候再保存');
    if (!v.name.trim()) return toast('请填写文件夹名称');
    if (old && !canMoveFolder(db.folders, v.id, v.parentId))
      return toast('不能移动到自身或后代文件夹');
    const saved = stamp({ ...v, name: v.name.trim() });
    update((d) => ({
      ...d,
      folders: old ? d.folders.map((f) => (f.id === v.id ? saved : f)) : [...d.folders, saved],
    }));
    setModal(null);
    toast('文件夹已保存');
  }
  return (
    <Sheet title={old ? '编辑文件夹' : '新建文件夹'} dirty={dirty} onClose={() => setModal(null)}>
      <form className="editor-form" onSubmit={save}>
        <FormSection title="文件夹信息">
          <Field label="名称 *" full>
            <input
              required
              maxLength={100}
              value={v.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="所属位置" full>
            <select
              value={v.parentId || ''}
              onChange={(e) => patch({ parentId: e.target.value || null })}
            >
              <option value="">根目录</option>
              {db.folders
                .filter((f) => !old || canMoveFolder(db.folders, old.id, f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderPath(db.folders, f.id)
                      .map((p) => p.name)
                      .join(' / ')}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="用途类型">
            <select value={v.purpose} onChange={(e) => patch({ purpose: e.target.value })}>
              {['普通文件夹', '物品分类', '商家档案', '自定义'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="标签 · 逗号分隔">
            <input
              value={v.tags.join('，')}
              onChange={(e) => patch({ tags: e.target.value.split(/[,，]/).map((s) => s.trim()) })}
            />
          </Field>
          <Field label="描述" full>
            <textarea
              value={v.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <div className="field full">
            <span>封面图片</span>
            <AttachmentInput
              value={v.cover}
              imagesOnly
              onBusyChange={setUploading}
              onChange={(cover) => patch({ cover })}
            />
          </div>
        </FormSection>
        {v.purpose === '商家档案' && (
          <FormSection title="商家资料 · 选填">
            {input('merchant', '商家名称')}
            {input('shopUrl', '店铺链接', 'url')}
            {input('contact', '联系方式')}
            {input('experience', '购物体验')}
            {input('service', '服务评价')}
            {input('packaging', '包装评价')}
            {input('shipping', '发货体验')}
          </FormSection>
        )}
        <ReviewFields value={v} onChange={patch} />
        <Footer busy={uploading} />
      </form>
    </Sheet>
  );
}
export function ItemForm({ modal }: { modal: Extract<Modal, { kind: 'item' }> }) {
  const { db, update, setModal, toast } = useApp();
  const [uploading, setUploading] = useState(false);
  const old = db.items.find((i) => i.id === modal.id);
  const { value: v, patch, dirty } = useDraft<Item>(old ?? makeItem(modal.folderId || null));
  const input = (key: keyof Item, label: string, type = 'text') => (
    <Field key={key} label={label}>
      <input
        type={type}
        value={(v[key] as string | number) ?? ''}
        min={type === 'number' ? (key === 'quantity' ? 1 : 0) : undefined}
        step={type === 'number' ? (key === 'quantity' ? 1 : '0.01') : undefined}
        required={key === 'quantity'}
        onChange={(e) =>
          patch({
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
  function save(e: FormEvent) {
    e.preventDefault();
    if (uploading) return toast('图片正在读取，请稍候再保存');
    if (!v.name.trim()) return toast('请填写物品名称');
    const start = v.startDate || dateKey(new Date(v.createdAt));
    if (v.dueDate && v.dueDate < start) return toast('截止日期不能早于开始日期');
    const saved = stamp({
      ...v,
      startDate: start,
      platformColor: getPlatformColor(db, v.platform, v.platformColor),
      name: v.name.trim(),
      tags: v.tags.filter(Boolean),
    });
    update((d) => ({
      ...d,
      items: old ? d.items.map((i) => (i.id === v.id ? saved : i)) : [...d.items, saved],
    }));
    setModal(null);
    toast('物品已保存');
  }
  return (
    <Sheet title={old ? '编辑物品' : '新建物品'} dirty={dirty} onClose={() => setModal(null)}>
      <form className="editor-form" onSubmit={save}>
        <FormSection title="基础信息">
          <Field label="物品名称 *" full>
            <input
              required
              maxLength={150}
              value={v.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <AttachmentInput
            value={v.attachments}
            imagesOnly
            onBusyChange={setUploading}
            onChange={(attachments) => patch({ attachments })}
          />
          {v.illustration && (
            <div className="switch-row full">
              <span>保留示例插画</span>
              <button
                type="button"
                className="text-button"
                onClick={() => patch({ illustration: '' })}
              >
                移除
              </button>
            </div>
          )}
          <Field label="文字描述" full>
            <textarea
              value={v.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Field label="标签 · 逗号分隔" full>
            <input
              value={v.tags.join('，')}
              onChange={(e) => patch({ tags: e.target.value.split(/[,，]/).map((s) => s.trim()) })}
            />
          </Field>
          {input('spec', '规格')}
          {input('quantity', '数量 *', 'number')}
        </FormSection>
        <FormSection title="收纳位置">
          <Field label="所属文件夹" full>
            <select
              value={v.folderId || ''}
              onChange={(e) => patch({ folderId: e.target.value || null })}
            >
              <option value="">根目录</option>
              {db.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(db.folders, f.id)
                    .map((p) => p.name)
                    .join(' / ')}
                </option>
              ))}
            </select>
          </Field>
          {input('location', '实际存放位置')}
          <Field label="个人备注" full>
            <textarea value={v.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
        </FormSection>
        <FormSection title="交易资料 · 均为选填">
          {input('merchant', '商家 / 交易对象')}
          <CatalogSelect
            kind="platform"
            label="交易平台"
            value={v.platform}
            onChange={(platform) =>
              patch({ platform, platformColor: getPlatformColor(db, platform) })
            }
          />
          {input('purchaseDate', '购买 / 售出日期', 'date')}
          {input('price', '交易价格（元）', 'number')}
          {input('productUrl', '商品链接', 'url')}
        </FormSection>
        <FormSection title="交易与日历">
          <div className="switch-row full">
            <div>
              <strong>加入日历</strong>
              <small>与订单使用相同的日程展示方式</small>
            </div>
            <Toggle
              label="物品加入日历"
              checked={v.calendarEnabled}
              onChange={(calendarEnabled) => patch({ calendarEnabled })}
            />
          </div>
          <Field label="物品交易类型">
            <select
              value={v.tradeKind}
              onChange={(e) => patch({ tradeKind: e.target.value as Item['tradeKind'] })}
            >
              <option value="purchase">购买记录</option>
              <option value="sale">售出记录</option>
              <option value="none">普通物品 · 不计收支</option>
            </select>
          </Field>
          {input('startDate', '物品开始日期', 'date')}
          {input('dueDate', '物品截止日期', 'date')}
          <p className="muted small full">
            未填写开始日期时使用最初写入日期。物品价格用于日历收支统计，关联已计入的订单时去重。
          </p>
        </FormSection>
        <ReviewFields value={v} onChange={patch} />
        <FormSection title="使用与展示">
          <Field label="使用感受" full>
            <textarea
              value={v.experience}
              onChange={(e) => patch({ experience: e.target.value })}
            />
          </Field>
          <div className="switch-row full">
            <div>
              <strong>加入首页展示</strong>
              <small>从开启展示的物品中随机精选</small>
            </div>
            <Toggle
              label="加入首页展示"
              checked={v.featured}
              onChange={(featured) => patch({ featured })}
            />
          </div>
        </FormSection>
        <Footer busy={uploading} />
      </form>
    </Sheet>
  );
}
