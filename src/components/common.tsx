import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Search,
  Star,
  X,
  ImagePlus,
  FileText,
  Trash2,
  ChevronLeft,
} from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useApp } from '../state/AppContext';
import type { Attachment, Item, Order, Review } from '../data/types';
import { entity } from '../data/domain';

export function PageHeader({
  title,
  onAdd,
  children,
}: {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  children?: ReactNode;
}) {
  const { setModal } = useApp();
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        <button
          className="icon-button"
          aria-label="全局搜索"
          onClick={() => setModal({ kind: 'search' })}
        >
          <Search size={21} />
        </button>
        {onAdd && (
          <button className="icon-button red-button" aria-label="新建" onClick={onAdd}>
            <Plus size={22} />
          </button>
        )}
        {children}
      </div>
    </header>
  );
}
export function DetailHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  const { back } = useApp();
  return (
    <header className="detail-header">
      <button className="icon-button" aria-label="返回" onClick={back}>
        <ArrowLeft size={22} />
      </button>
      <span>{title}</span>
      {onEdit ? (
        <button className="text-button" onClick={onEdit}>
          编辑
        </button>
      ) : (
        <span />
      )}
    </header>
  );
}
export function SectionTitle({
  title,
  label,
  onClick,
}: {
  title: string;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>
        {title}
        <i />
      </h2>
      {label && (
        <button className="text-button" onClick={onClick}>
          {label}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  label = '去添加',
  icon,
}: {
  title: string;
  description?: string;
  action?: () => void;
  label?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">{icon || <Plus size={24} />}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && (
        <button className="secondary" onClick={action}>
          {label}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  full = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
  hint?: string;
}) {
  const id = useId();
  const control =
    isValidElement(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type)
      ? cloneElement(
          children as ReactElement<{ 'aria-labelledby'?: string; 'aria-describedby'?: string }>,
          { 'aria-labelledby': id, 'aria-describedby': hint ? `${id}-hint` : undefined },
        )
      : children;
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span id={id}>{label}</span>
      {control}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}
export function Stars({
  value,
  onChange,
}: {
  value: number | null;
  onChange?: (n: number | null) => void;
}) {
  return (
    <div
      className={`stars ${onChange ? 'editable' : ''}`}
      aria-label={value ? `${value}星` : '未评分'}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            type="button"
            key={n}
            aria-label={`评${n}星`}
            onClick={() => onChange(n === value ? null : n)}
          >
            <Star size={24} fill={value && n <= value ? 'currentColor' : 'none'} />
          </button>
        ) : (
          <Star key={n} size={13} fill={value && n <= value ? 'currentColor' : 'none'} />
        ),
      )}
      {onChange && (
        <button className="text-button rating-clear" type="button" onClick={() => onChange(null)}>
          清除
        </button>
      )}
    </div>
  );
}
export function ReviewFields({
  value,
  onChange,
}: {
  value: Review;
  onChange: (value: Partial<Review>) => void;
}) {
  return (
    <FormSection title="我的评价 · 选填">
      <div className="field full">
        <span>评分</span>
        <Stars value={value.rating} onChange={(rating) => onChange({ rating })} />
      </div>
      <Field label="文字评价" full>
        <textarea
          value={value.review}
          onChange={(e) => onChange({ review: e.target.value })}
          placeholder="填写评价（选填）"
        />
      </Field>
      <Field label="优点">
        <input value={value.pros} onChange={(e) => onChange({ pros: e.target.value })} />
      </Field>
      <Field label="缺点">
        <input value={value.cons} onChange={(e) => onChange({ cons: e.target.value })} />
      </Field>
    </FormSection>
  );
}
export function ReviewDisplay({ value }: { value: Review }) {
  return (
    <section className="paper detail-section">
      <SectionTitle title="个人评价" />
      {value.rating !== null ? <Stars value={value.rating} /> : <p className="muted">尚未评分</p>}
      {value.review && <p className="body-copy">{value.review}</p>}
      {value.pros && (
        <p className="body-copy">
          <span className="muted">优点 / </span>
          {value.pros}
        </p>
      )}
      {value.cons && (
        <p className="body-copy">
          <span className="muted">缺点 / </span>
          {value.cons}
        </p>
      )}
      {!value.review && <p className="muted small">尚未填写文字评价</p>}
    </section>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Progress({ order, compact = false }: { order: Order; compact?: boolean }) {
  return (
    <div className={`progress ${compact ? 'compact' : ''}`}>
      <div
        className="progress-line"
        style={
          {
            '--progress': `${(order.stage / (order.steps.length - 1)) * 100}%`,
          } as React.CSSProperties
        }
      >
        {order.steps.map((_, index) => (
          <i key={index} className={index <= order.stage ? 'passed' : ''} />
        ))}
      </div>
      <div className="progress-labels">
        {order.steps.map((step, index) => (
          <span key={index} className={index === order.stage ? 'current' : ''}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}
export function ItemArt({
  item,
  className = '',
}: {
  item: Pick<Item, 'name' | 'attachments' | 'illustration'>;
  className?: string;
}) {
  const src = item.attachments.find((a) => a.mime.startsWith('image/'))?.data || item.illustration;
  return src ? (
    <img className={`item-art ${className}`} src={src} alt={item.name} />
  ) : (
    <div className={`art-placeholder ${className}`}>
      <span>{item.name.slice(0, 1) || '物'}</span>
      <i />
      <small>我的收藏</small>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = '搜索名称、标签、商家…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="清除搜索" onClick={() => onChange('')}>
          <X size={17} />
        </button>
      )}
    </div>
  );
}
export function AttachmentInput({
  value,
  onChange,
  imagesOnly = false,
  onBusyChange,
}: {
  value: Attachment[];
  onChange: (a: Attachment[]) => void;
  imagesOnly?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      if (value.length + files.length > 12) throw new Error('每条记录最多 12 个附件');
      const additions: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024) throw new Error('单个文件请控制在 8 MB 以内');
        const image = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type);
        if (!image && (imagesOnly || !['application/pdf', 'text/plain'].includes(file.type)))
          throw new Error(
            imagesOnly
              ? '请选择 PNG、JPG、WebP 或 GIF 图片'
              : '支持 PNG、JPG、WebP、GIF、PDF 和 TXT',
          );
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('文件读取失败'));
          reader.readAsDataURL(file);
        });
        additions.push({ ...entity(), name: file.name, mime: file.type, size: file.size, data });
      }
      onChange([...value, ...additions]);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="attachment-input full">
      <div className="attachment-grid">
        {value.map((a) => (
          <div className="attachment-thumb" key={a.id}>
            {a.mime.startsWith('image/') ? (
              <img src={a.data} alt={a.name} />
            ) : (
              <FileText size={28} />
            )}
            <button
              type="button"
              aria-label={`删除附件${a.name}`}
              disabled={busy}
              onClick={() => onChange(value.filter((x) => x.id !== a.id))}
            >
              <X size={13} />
            </button>
            <small>{a.name}</small>
          </div>
        ))}
        <label className="upload-button">
          <ImagePlus size={24} />
          <span>{busy ? '读取中…' : '添加附件'}</span>
          <input
            aria-label="上传附件"
            type="file"
            accept={
              imagesOnly
                ? 'image/png,image/jpeg,image/webp,image/gif'
                : 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain'
            }
            multiple
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <small className="muted">本地保存 · 最多 12 个文件 · 单个不超过 8 MB</small>
    </div>
  );
}
export function AttachmentGallery({ value }: { value: Attachment[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const images = value.filter((a) => a.mime.startsWith('image/'));
  return (
    <>
      {value.length > 0 && (
        <div className="attachment-grid view-gallery">
          {value.map((a) =>
            a.mime.startsWith('image/') ? (
              <button
                className="gallery-thumb"
                aria-label={`预览${a.name}`}
                key={a.id}
                onClick={() => setIndex(images.findIndex((i) => i.id === a.id))}
              >
                <img src={a.data} alt={a.name} />
              </button>
            ) : (
              <a key={a.id} className="file-link" download={a.name} href={a.data}>
                <FileText size={22} />
                {a.name}
              </a>
            ),
          )}
        </div>
      )}
      {index !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="图片预览">
          <button
            className="icon-button close-lightbox"
            aria-label="关闭预览"
            onClick={() => setIndex(null)}
          >
            <X />
          </button>
          <img src={images[index].data} alt={images[index].name} />
          <div>
            <button
              className="icon-button"
              aria-label="上一张图片"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ChevronLeft />
            </button>
            <span>
              {index + 1} / {images.length}
            </span>
            <button
              className="icon-button"
              aria-label="下一张图片"
              disabled={index === images.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <ChevronRight />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export function SafeLink({ href, children }: { href: string; children?: ReactNode }) {
  const valid = /^https?:\/\//i.test(href);
  return valid ? (
    <a className="external-link" href={href} target="_blank" rel="noreferrer">
      {children || href}
      <ChevronRight size={14} />
    </a>
  ) : href ? (
    <span className="muted small">{href}</span>
  ) : null;
}
export function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <div>{value || '未填写'}</div>
    </div>
  );
}
export function DeleteButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="text-button danger-text" onClick={onClick}>
      <Trash2 size={16} />
      {children}
    </button>
  );
}

export function Sheet({
  title,
  children,
  onClose,
  dirty = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
}) {
  const { confirm, confirming } = useApp();
  const ref = useRef<HTMLElement>(null);
  function close() {
    if (dirty) confirm('放弃未保存的修改？', '这次填写的内容尚未保存。', onClose);
    else onClose();
  }
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, input')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (document.querySelector('.confirm-layer, .lightbox')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,a[href]',
        );
        if (!els?.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handler);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        inert={confirming ? true : undefined}
        aria-hidden={confirming ? true : undefined}
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭" onClick={close}>
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
