import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Copy,
  Folder as FolderIcon,
  FolderOpen,
  Heart,
  Link2,
  Move,
  Plus,
  Trash2,
  Search,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { deleteFolder, descendants, entity, folderPath, hiddenFolder, stamp } from '../data/domain';
import { money } from '../lib/date';
import {
  AttachmentGallery,
  DetailHeader,
  Empty,
  Info,
  ItemArt,
  PageHeader,
  ReviewDisplay,
  SafeLink,
  SearchInput,
  SectionTitle,
  Stars,
  Toggle,
} from '../components/common';
import type { Folder, Item } from '../data/types';
import { CollectionCategory } from '../components/CollectionCategory';

function Breadcrumbs({ id }: { id: string | null }) {
  const { db, navigate } = useApp();
  const path = folderPath(db.folders, id);
  return (
    <nav className="breadcrumbs" aria-label="文件夹路径">
      <button onClick={() => navigate({ page: 'storage' })}>全部收纳</button>
      {path.map((f) => (
        <span key={f.id}>
          <ChevronRight size={12} />
          <button onClick={() => navigate({ page: 'storage', detail: 'folder', id: f.id })}>
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
function FolderCard({ folder }: { folder: Folder }) {
  const { db, navigate } = useApp();
  const subs = db.folders.filter((f) => f.parentId === folder.id).length;
  const count = db.items.filter((i) => i.folderId === folder.id).length;
  return (
    <button
      className="folder-card"
      onClick={() => navigate({ page: 'storage', detail: 'folder', id: folder.id })}
    >
      <div className={`folder-cover ${folder.purpose === '商家档案' ? 'merchant-folder' : ''}`}>
        {folder.cover[0] ? (
          <img src={folder.cover[0].data} alt="" />
        ) : (
          <>
            <FolderIcon size={29} strokeWidth={1.3} />
            <span>{folder.name.slice(0, 1)}</span>
          </>
        )}
      </div>
      <div>
        <strong>{folder.name}</strong>
        <small>
          {folder.archived ? '已归档 · ' : ''}
          {subs} 个文件夹 · {count} 件物品
        </small>
        {folder.rating !== null && <Stars value={folder.rating} />}
      </div>
      <ChevronRight size={16} />
    </button>
  );
}
function ItemCard({ item, showPath = false }: { item: Item; showPath?: boolean }) {
  const { db, navigate } = useApp();
  return (
    <button
      className="item-card"
      onClick={() => navigate({ page: 'storage', detail: 'item', id: item.id })}
    >
      <div className="item-card-image">
        <ItemArt item={item} />
        {item.featured && (
          <span className="featured-label">
            <Heart size={11} fill="currentColor" />
            展示中
          </span>
        )}
      </div>
      <h3>{item.name}</h3>
      <small>
        {showPath
          ? folderPath(db.folders, item.folderId)
              .map((f) => f.name)
              .join(' / ') || '根目录'
          : item.spec || item.merchant || `${item.quantity} 件收藏`}
      </small>
      {item.rating !== null && <Stars value={item.rating} />}
    </button>
  );
}
function Contents({ folderId }: { folderId: string | null }) {
  const { db, setModal } = useApp();
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const match = (values: string[]) => values.join(' ').toLowerCase().includes(query.toLowerCase());
  const folders = db.folders.filter(
    (f) =>
      (query ? true : f.parentId === folderId) &&
      (archived
        ? f.archived || hiddenFolder(db.folders, f.parentId)
        : !f.archived && !hiddenFolder(db.folders, f.parentId)) &&
      match([f.name, f.merchant, ...f.tags]),
  );
  const items = db.items.filter(
    (i) =>
      (query ? true : i.folderId === folderId) &&
      (archived
        ? i.archived || hiddenFolder(db.folders, i.folderId)
        : !i.archived && !hiddenFolder(db.folders, i.folderId)) &&
      match([i.name, i.merchant, ...i.tags]),
  );
  return (
    <>
      <SearchInput value={query} onChange={setQuery} />
      <div className="list-toolbar">
        <span>
          {folders.length} 个文件夹 · {items.length} 件物品{query && ' · 全库搜索'}
        </span>
        <button
          className={`text-button ${archived ? 'accent' : ''}`}
          onClick={() => setArchived((v) => !v)}
        >
          <Archive size={14} />
          {archived ? '查看在用' : '查看归档'}
        </button>
      </div>
      {folders.length > 0 && (
        <div className="folder-list">
          {folders.map((f) => (
            <div key={f.id}>
              {query ? (
                <FolderCard folder={f} />
              ) : (
                <CollectionCategory folder={f} showArchived={archived} />
              )}
              {query && (
                <p className="result-path">
                  {folderPath(db.folders, f.parentId)
                    .map((p) => p.name)
                    .join(' / ') || '根目录'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="item-grid">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} showPath={!!query} />
          ))}
        </div>
      )}
      {folders.length === 0 && items.length === 0 && (
        <Empty
          title={query ? '暂时没有找到' : archived ? '还没有归档内容' : '暂无收纳内容'}
          description={
            query ? '试试其他名称、商家或标签。' : '文件夹可以自由嵌套，物品也可以直接放在这里。'
          }
          label="添加收纳"
          action={() => setModal({ kind: 'create', folderId })}
        />
      )}
    </>
  );
}
export function Storage() {
  const { db, setModal } = useApp();
  return (
    <main className="page storage-page">
      <div className="storage-tools" aria-label="收纳操作">
        <button
          className="icon-button"
          aria-label="全局搜索"
          onClick={() => setModal({ kind: 'search' })}
        >
          <Search size={21} />
        </button>
        <button
          className="icon-button red-button"
          aria-label="新建"
          onClick={() => setModal({ kind: 'create', folderId: null })}
        >
          <Plus size={22} />
        </button>
      </div>
      <Contents folderId={null} />
    </main>
  );
}
export function FolderDetail({ id }: { id: string }) {
  const { db, update, setModal, confirm, navigate, toast, back } = useApp();
  const folder = db.folders.find((f) => f.id === id);
  if (!folder)
    return (
      <main className="page">
        <DetailHeader title="文件夹" />
        <Empty title="文件夹已不存在" action={back} label="返回" />
      </main>
    );
  const removed = descendants(db.folders, id);
  const itemCount = db.items.filter((i) => i.folderId && removed.has(i.folderId)).length;
  return (
    <main className="page detail-page">
      <DetailHeader title="文件夹档案" onEdit={() => setModal({ kind: 'folder', id })} />
      <Breadcrumbs id={id} />
      {folder.cover[0] && (
        <div className="folder-detail-cover">
          <AttachmentGallery value={folder.cover} />
        </div>
      )}
      <div className="detail-title folder-detail-title">
        <FolderOpen size={32} strokeWidth={1.2} />
        <div>
          <span className="eyebrow">
            {folder.purpose}
            {folder.archived ? ' · 已归档' : ''}
          </span>
          <h1>{folder.name}</h1>
        </div>
      </div>
      {folder.description && <p className="body-copy">{folder.description}</p>}
      <div className="tag-row">
        {folder.tags.filter(Boolean).map((t, i) => (
          <span className="tag" key={i}>
            #{t}
          </span>
        ))}
      </div>
      <div className="folder-actions">
        <button className="secondary" onClick={() => setModal({ kind: 'folder', parentId: id })}>
          <Plus size={16} />
          子文件夹
        </button>
        <button className="primary" onClick={() => setModal({ kind: 'item', folderId: id })}>
          <Plus size={16} />
          添加物品
        </button>
      </div>
      <Contents folderId={id} />
      <ReviewDisplay value={folder} />
      {folder.purpose === '商家档案' && (
        <section className="paper detail-section">
          <SectionTitle title="商家档案" />
          <Info label="商家名称" value={folder.merchant} />
          <Info label="店铺链接" value={<SafeLink href={folder.shopUrl} />} />
          <Info label="联系方式" value={folder.contact} />
          <Info label="购物体验" value={folder.experience} />
          <Info label="服务评价" value={folder.service} />
          <Info label="包装评价" value={folder.packaging} />
          <Info label="发货体验" value={folder.shipping} />
        </section>
      )}
      <div className="detail-actions">
        <button
          className="secondary"
          onClick={() => setModal({ kind: 'move', entity: 'folder', id })}
        >
          <Move size={16} />
          移动文件夹
        </button>
        <button
          className="secondary"
          onClick={() => {
            update((d) => ({
              ...d,
              folders: d.folders.map((f) =>
                f.id === id ? stamp({ ...f, archived: !f.archived }) : f,
              ),
            }));
            toast(folder.archived ? '文件夹已恢复' : '文件夹已归档');
          }}
        >
          {folder.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{' '}
          {folder.archived ? '恢复' : '归档'}
        </button>
        <button
          className="secondary danger-text"
          onClick={() =>
            confirm(
              '删除文件夹及其中内容？',
              `「${folder.name}」包含 ${removed.size - 1} 个后代文件夹与 ${itemCount} 件物品，确认后全部删除。关联订单保留。`,
              () => {
                update((d) => deleteFolder(d, id));
                navigate({ page: 'storage' });
                toast('文件夹及其内容已删除');
              },
            )
          }
        >
          <Trash2 size={16} />
          删除文件夹
        </button>
      </div>
    </main>
  );
}
export function ItemDetail({ id }: { id: string }) {
  const { db, update, setModal, confirm, navigate, toast, back } = useApp();
  const item = db.items.find((i) => i.id === id);
  const [preview, setPreview] = useState(false);
  if (!item)
    return (
      <main className="page">
        <DetailHeader title="物品详情" />
        <Empty title="这件物品已不存在" action={back} label="返回" />
      </main>
    );
  const orderIds = new Set(db.links.filter((l) => l.itemId === id).map((l) => l.orderId));
  const orders = db.orders.filter((o) => orderIds.has(o.id));
  return (
    <main className="page detail-page">
      <DetailHeader title="物品档案" onEdit={() => setModal({ kind: 'item', id })} />
      <Breadcrumbs id={item.folderId} />
      <button
        className="item-detail-art"
        aria-label="查看物品图片"
        onClick={() => setPreview((v) => !v)}
      >
        <ItemArt item={item} />
        <span>{preview ? '收起图片列表' : '查看图片资料'}</span>
      </button>
      {preview &&
        (item.attachments.length ? (
          <AttachmentGallery value={item.attachments} />
        ) : (
          <p className="muted small">当前为本地示例插画。可在编辑中上传自己的图片。</p>
        ))}
      <div className="detail-title">
        <span className="eyebrow">物品档案{item.archived ? ' · 已归档' : ''}</span>
        <h1>{item.name}</h1>
        <div className="tag-row">
          {item.tags.filter(Boolean).map((t, i) => (
            <span className="tag" key={i}>
              #{t}
            </span>
          ))}
        </div>
      </div>
      <p className="body-copy">{item.description || '这件物品还没有文字描述。'}</p>
      <section className="paper feature-switch">
        <div>
          <Heart size={20} />
          <div>
            <strong>加入首页展示</strong>
            <small>在首页展示此物品</small>
          </div>
        </div>
        <Toggle
          label="加入首页展示"
          checked={item.featured}
          onChange={(featured) => {
            update((d) => ({
              ...d,
              items: d.items.map((i) => (i.id === id ? stamp({ ...i, featured }) : i)),
            }));
            toast(featured ? '已加入首页随机精选' : '已移出首页展示');
          }}
        />
      </section>
      <section className="paper detail-section">
        <SectionTitle title="物品与收纳" />
        <Info label="规格" value={item.spec} />
        <Info label="数量" value={item.quantity} />
        <Info label="实际存放位置" value={item.location} />
        {item.notes && <p className="note-block">{item.notes}</p>}
      </section>
      <section className="paper detail-section">
        <SectionTitle title="交易档案" />
        <Info label="商家" value={item.merchant} />
        <Info label="平台" value={item.platform} />
        <Info label="购买 / 售出日期" value={item.purchaseDate} />
        <Info label="价格" value={money(item.price)} />
        {item.productUrl && <SafeLink href={item.productUrl} />}
      </section>
      <section className="paper detail-section">
        <SectionTitle title="日历与交易" />
        <div className="switch-row">
          <strong>加入日历</strong>
          <Toggle
            label="物品加入日历"
            checked={item.calendarEnabled}
            onChange={(calendarEnabled) => {
              update((d) => ({
                ...d,
                items: d.items.map((i) => (i.id === id ? stamp({ ...i, calendarEnabled }) : i)),
              }));
              toast('日历展示已更新');
            }}
          />
        </div>
        <Info
          label="交易类型"
          value={
            item.tradeKind === 'sale'
              ? '售出记录'
              : item.tradeKind === 'purchase'
                ? '购买记录'
                : '普通物品'
          }
        />
        <Info label="开始日期" value={item.startDate} />
        <Info label="截止日期" value={item.dueDate || '未设置'} />
      </section>
      <ReviewDisplay value={item} />
      {item.experience && (
        <section className="paper detail-section">
          <SectionTitle title="使用感受" />
          <p className="body-copy">{item.experience}</p>
        </section>
      )}
      <section className="paper detail-section">
        <SectionTitle
          title="关联订单"
          label="关联订单"
          onClick={() => setModal({ kind: 'link', entity: 'item', id })}
        />
        {orders.length ? (
          orders.map((o) => (
            <div className="linked-row" key={o.id}>
              <button onClick={() => navigate({ page: 'orders', detail: 'order', id: o.id })}>
                <Link2 size={18} />
                <span>{o.name}</span>
                <ChevronRight size={16} />
              </button>
              <button
                className="text-button small"
                onClick={() => {
                  update((d) => ({
                    ...d,
                    links: d.links.filter((l) => !(l.orderId === o.id && l.itemId === id)),
                  }));
                  toast('已取消关联，订单仍保留');
                }}
              >
                取消关联
              </button>
            </div>
          ))
        ) : (
          <p className="muted">尚未关联订单，物品也可以独立收藏。</p>
        )}
      </section>
      <div className="detail-actions">
        <button
          className="secondary"
          onClick={() => setModal({ kind: 'move', entity: 'item', id })}
        >
          <Move size={16} />
          移动
        </button>
        <button
          className="secondary"
          onClick={() => {
            const copy = {
              ...item,
              ...entity(),
              name: `${item.name}（副本）`,
              featured: false,
              attachments: item.attachments.map((a) => ({ ...a, ...entity() })),
            };
            update((d) => ({ ...d, items: [...d.items, copy] }));
            navigate({ page: 'storage', detail: 'item', id: copy.id });
            toast('已复制条目，未复制订单关联');
          }}
        >
          <Copy size={16} />
          复制条目
        </button>
        <button
          className="secondary"
          onClick={() => {
            update((d) => ({
              ...d,
              items: d.items.map((i) => (i.id === id ? stamp({ ...i, archived: !i.archived }) : i)),
            }));
            toast(item.archived ? '物品已恢复' : '物品已归档');
          }}
        >
          {item.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{' '}
          {item.archived ? '恢复' : '归档'}
        </button>
        <button
          className="secondary danger-text"
          onClick={() =>
            confirm('删除这件物品？', `「${item.name}」的图片与评价将删除，关联订单保留。`, () => {
              update((d) => ({
                ...d,
                items: d.items.filter((i) => i.id !== id),
                links: d.links.filter((l) => l.itemId !== id),
              }));
              navigate({ page: 'storage' });
              toast('物品已删除');
            })
          }
        >
          <Trash2 size={16} />
          删除
        </button>
      </div>
    </main>
  );
}
