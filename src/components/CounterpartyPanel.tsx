import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronRight, Link2 } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { deleteCounterparty, makeCounterparty, saveCounterparty } from '../data/workflow';
import { Field, FormSection, Sheet } from './common';
import { Footer, useDraft } from './FormUtils';
import { CatalogSelect } from './CatalogFields';

export function CounterpartyPanel({ id }: { id?: string }) {
  const { db, update, setModal, confirm, navigate, toast } = useApp();
  const old = db.counterparties.find((p) => p.id === id);
  const { value: v, patch, dirty } = useDraft(old || makeCounterparty());
  const [part, setPart] = useState('overview');
  const orders = db.orders.filter((o) => o.counterpartyId === v.id);
  useEffect(() => {
    document.querySelector('.sheet')?.scrollTo({ top: 0 });
  }, [part]);
  const labels: { [k: string]: string } = {
    basic: '基本资料',
    requirements: '需求',
    preferences: '偏好',
    avoidances: '雷点',
    orders: '关联订单',
  };
  function save(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) {
      setPart('basic');
      return toast('请填写对象名称');
    }
    update((d) => saveCounterparty(d, { ...v, name: v.name.trim() }));
    setModal(null);
    toast('交易对象已保存');
  }
  return (
    <Sheet
      title={old ? '交易对象档案' : '新建交易对象'}
      dirty={dirty}
      onClose={() => setModal(null)}
    >
      <form className="editor-form contact-panel" onSubmit={save}>
        {part === 'overview' ? (
          <>
            <div className="contact-identity">
              <span>{v.name.slice(0, 1) || '档'}</span>
              <div>
                <h3>{v.name || '未填写对象名称'}</h3>
                <p>
                  {v.platform || '未指定平台'} · {v.role}
                </p>
              </div>
            </div>
            <div className="contact-sections">
              {Object.entries(labels).map(([key, label]) => (
                <button type="button" key={key} aria-label={label} onClick={() => setPart(key)}>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {key === 'basic'
                        ? [v.contact, v.url, v.notes].filter(Boolean).join(' · ') ||
                          '名称、平台与联系方式'
                        : key === 'orders'
                          ? `${orders.length} 笔订单`
                          : v[key as 'requirements' | 'preferences' | 'avoidances'] || '未填写'}
                    </small>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              className="text-button contact-back"
              type="button"
              onClick={() => setPart('overview')}
            >
              <ArrowLeft size={16} />
              返回档案
            </button>
            {part === 'basic' ? (
              <FormSection title="基本资料">
                <Field label="对象名称 *" full>
                  <input
                    required
                    maxLength={100}
                    value={v.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </Field>
                <CatalogSelect
                  kind="platform"
                  label="预约 / 来源平台"
                  value={v.platform}
                  onChange={(platform) => patch({ platform })}
                />
                <Field label="对象类型">
                  <select value={v.role} onChange={(e) => patch({ role: e.target.value })}>
                    {['委托方', '创作者', '买家', '商家', '交易对象', '其他'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="联系方式" full>
                  <input value={v.contact} onChange={(e) => patch({ contact: e.target.value })} />
                </Field>
                <Field label="主页 / 预约链接" full>
                  <input
                    type="url"
                    value={v.url}
                    onChange={(e) => patch({ url: e.target.value })}
                  />
                </Field>
                <Field label="对象备注" full>
                  <textarea value={v.notes} onChange={(e) => patch({ notes: e.target.value })} />
                </Field>
              </FormSection>
            ) : part === 'orders' ? (
              <FormSection title={`关联订单 · ${orders.length}`}>
                <div className="full">
                  <button
                    type="button"
                    className="secondary wide"
                    disabled={!old || dirty}
                    onClick={() => setModal({ kind: 'counterparty-link', id: v.id })}
                  >
                    <Link2 size={16} />
                    管理订单关联
                  </button>
                  {(!old || dirty) && <p className="muted small">保存档案后可管理订单关联。</p>}
                  {orders.map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      disabled={dirty}
                      className="workspace-link-row"
                      onClick={() => {
                        setModal(null);
                        navigate({ page: 'orders', detail: 'order', id: o.id });
                      }}
                    >
                      <div>
                        <strong>{o.name}</strong>
                        <small>
                          {o.type} · {o.status}
                        </small>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </FormSection>
            ) : (
              <FormSection title={labels[part]}>
                <Field label={labels[part]} full>
                  <textarea
                    rows={8}
                    value={v[part as 'requirements' | 'preferences' | 'avoidances']}
                    onChange={(e) => patch({ [part]: e.target.value })}
                    placeholder={`填写${labels[part]}（选填）`}
                  />
                </Field>
              </FormSection>
            )}
          </>
        )}
        <Footer />
        {old && part === 'overview' && (
          <button
            type="button"
            className="delete-wide"
            onClick={() =>
              confirm('删除交易对象？', '保留关联订单中的历史资料，仅解除档案关联。', () => {
                update((d) => deleteCounterparty(d, v.id));
                setModal(null);
                toast('交易对象已删除');
              })
            }
          >
            删除交易对象
          </button>
        )}
      </form>
    </Sheet>
  );
}
