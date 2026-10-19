import { useState } from 'react';
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { entity, stamp } from '../data/domain';
import { colorForName, feeAmount, netAmount, removePlatform } from '../data/catalog';
import type { CashFlow, FeeMode } from '../data/types';
import { money } from '../lib/date';
import { Field, FormSection, Sheet } from './common';

export function CatalogEditor({
  kind,
  onAdded,
}: {
  kind: 'type' | 'platform';
  onAdded?: (name: string) => void;
}) {
  const { db, update, toast, confirm } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5979A7');
  const label = kind === 'type' ? '订单类型' : '平台';
  const list = kind === 'type' ? db.orderTypes : db.platforms;
  function add() {
    const value = name.trim();
    if (!value) return toast(`请填写${label}名称`);
    if (list.some((o) => o.name.toLowerCase() === value.toLowerCase()))
      return toast(`${label}已存在`);
    update((d) =>
      kind === 'type'
        ? { ...d, orderTypes: [...d.orderTypes, { ...entity(), name: value }] }
        : { ...d, platforms: [...d.platforms, { ...entity(), name: value, color }] },
    );
    setName('');
    onAdded?.(value);
    toast(`${label}已添加`);
  }
  return (
    <div className="catalog-editor">
      <div className="catalog-list">
        {list.map((o) => (
          <div className="catalog-option-row" key={o.id}>
            {'color' in o && (
              <input
                type="color"
                aria-label={`平台${o.name}颜色`}
                value={String(o.color)}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    platforms: d.platforms.map((p) =>
                      p.id === o.id ? stamp({ ...p, color: e.target.value }) : p,
                    ),
                  }))
                }
              />
            )}
            <span>{o.name}</span>
            <button
              type="button"
              className="icon-button"
              aria-label={`删除${label}${o.name}`}
              onClick={() =>
                confirm(
                  `删除${label}选项？`,
                  '仅从可选列表移除，已有订单、模板和物品中的记录保留。',
                  () => {
                    update((d) =>
                      kind === 'type'
                        ? { ...d, orderTypes: d.orderTypes.filter((x) => x.id !== o.id) }
                        : removePlatform(d, o.id),
                    );
                    toast(`${label}选项已删除`);
                  },
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="catalog-add-row">
        <input
          aria-label={`新增${label}名称`}
          maxLength={100}
          placeholder={`新${label}名称`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (kind === 'platform') setColor(colorForName(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        {kind === 'platform' && (
          <input
            type="color"
            aria-label="新平台颜色"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        )}
        <button type="button" className="secondary" onClick={add}>
          <Plus size={15} />
          添加
        </button>
      </div>
    </div>
  );
}
export function CatalogSelect({
  kind,
  label,
  value,
  onChange,
  full = false,
}: {
  kind: 'type' | 'platform';
  label: string;
  value: string;
  onChange: (name: string) => void;
  full?: boolean;
}) {
  const { db } = useApp();
  const [manage, setManage] = useState(false);
  const options = kind === 'type' ? db.orderTypes : db.platforms;
  return (
    <div className={`catalog-field ${full ? 'full' : ''}`}>
      <Field label={label}>
        <select required={kind === 'type'} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{kind === 'type' ? '请选择类型' : '未指定平台'}</option>
          {value && !options.some((o) => o.name === value) && (
            <option value={value}>{value}（历史记录）</option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <button
        className="text-button catalog-manage"
        type="button"
        onClick={() => setManage((v) => !v)}
      >
        <SlidersHorizontal size={12} />
        {manage ? '收起管理' : `管理${kind === 'type' ? '类型' : '平台'}`}
      </button>
      {manage && <CatalogEditor kind={kind} onAdded={onChange} />}
    </div>
  );
}
export interface FeeValue {
  amount: number | null;
  platformFeeMode: FeeMode;
  platformFee: number;
  cashFlow: CashFlow;
}
export function FeeFields({
  value: v,
  onChange,
}: {
  value: FeeValue;
  onChange: (p: Partial<FeeValue>) => void;
}) {
  return (
    <FormSection title="金额与平台费用">
      <Field label="设定金额（元）">
        <input
          type="number"
          min="0"
          step="0.01"
          value={v.amount ?? ''}
          onChange={(e) =>
            onChange({ amount: e.target.value === '' ? null : Number(e.target.value) })
          }
        />
      </Field>
      <Field label="平台费用方式">
        <select
          value={v.platformFeeMode}
          onChange={(e) => onChange({ platformFeeMode: e.target.value as FeeMode })}
        >
          <option value="fixed">固定费用（元）</option>
          <option value="percent">按比例（%）</option>
        </select>
      </Field>
      <Field label={v.platformFeeMode === 'percent' ? '平台费用（%）' : '平台费用（元）'}>
        <input
          type="number"
          min="0"
          max={v.platformFeeMode === 'percent' ? 100 : undefined}
          step="0.01"
          required
          value={v.platformFee}
          onChange={(e) => onChange({ platformFee: Number(e.target.value) })}
        />
      </Field>
      <Field label="实际金额（扣除平台费）">
        <input readOnly value={money(netAmount(v.amount, v.platformFeeMode, v.platformFee))} />
      </Field>
      <Field label="收支归类" full>
        <select
          value={v.cashFlow}
          onChange={(e) => onChange({ cashFlow: e.target.value as CashFlow })}
        >
          <option value="income">收入</option>
          <option value="expense">支出</option>
          <option value="none">不计收支</option>
        </select>
      </Field>
      <p className="muted small full">
        平台费用 {money(feeAmount(v.amount, v.platformFeeMode, v.platformFee))}
        。实际金额由设定金额扣除平台费自动计算。
      </p>
    </FormSection>
  );
}
export function CatalogSheet() {
  const { setModal } = useApp();
  return (
    <Sheet title="类型与平台设置" onClose={() => setModal(null)}>
      <div className="sheet-body">
        <h3 className="subheading">订单类型</h3>
        <CatalogEditor kind="type" />
        <h3 className="subheading">平台与日历颜色</h3>
        <p className="muted small">
          选择色块修改平台颜色，所有日历同步更新。删除选项会保留历史记录。
        </p>
        <CatalogEditor kind="platform" />
      </div>
    </Sheet>
  );
}
