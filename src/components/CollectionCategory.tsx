import { ChevronRight, Folder, Layers } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { descendants, folderPath, hiddenFolder } from '../data/domain';
import type { Folder as FolderData } from '../data/types';
import { ItemArt } from './common';
export function CollectionCategory({
  folder,
  showArchived = false,
}: {
  folder: FolderData;
  showArchived?: boolean;
}) {
  const { db, navigate } = useApp();
  const nodes = db.folders.filter(
    (f) => showArchived || (!f.archived && !hiddenFolder(db.folders, f.parentId)),
  );
  const all = descendants(nodes, folder.id);
  const items = db.items.filter(
    (i) => !!i.folderId && all.has(i.folderId) && (showArchived || !i.archived),
  );
  const children = nodes.filter((f) => f.parentId === folder.id);
  const previews = items.filter((i) => i.attachments.length || i.illustration).slice(0, 5);
  const open = (id: string) => navigate({ page: 'storage', detail: 'folder', id });
  return (
    <section className="collection-category">
      <div className="collection-category-heading">
        <button className="category-title" aria-label={folder.name} onClick={() => open(folder.id)}>
          <h2>{folder.name}</h2>
          <ChevronRight size={17} />
        </button>
        <span>
          <Layers size={12} />
          {items.length}
        </span>
      </div>
      <button
        className="collection-collage"
        aria-label={`查看${folder.name}收纳`}
        onClick={() => open(folder.id)}
      >
        {previews.length ? (
          previews.map((i, n) => (
            <span
              key={i.id}
              style={{
                left: `${((n + 0.5) * 100) / previews.length}%`,
                transform: `translateX(-50%) rotate(${(n - (previews.length - 1) / 2) * 7}deg)`,
              }}
            >
              <ItemArt item={i} />
            </span>
          ))
        ) : folder.cover[0] ? (
          <img className="collection-cover" src={folder.cover[0].data} alt="" />
        ) : (
          <span className="empty-collection-cover">
            <Folder size={35} strokeWidth={1} />
          </span>
        )}
      </button>
      {children.length > 0 && (
        <div className="collection-subcategories">
          {children.map((child) => {
            const ids = descendants(nodes, child.id);
            const leaf = nodes.filter(
              (f) => f.id !== child.id && ids.has(f.id) && !nodes.some((n) => n.parentId === f.id),
            );
            const sample = items.filter((i) => i.folderId && ids.has(i.folderId)).slice(0, 3);
            return (
              <article className="collection-subcategory" key={child.id}>
                <button className="subcategory-title" onClick={() => open(child.id)}>
                  <h3>{child.name}</h3>
                  <ChevronRight size={13} />
                </button>
                {sample.length > 0 && (
                  <div className="subcategory-thumbnails">
                    {sample.map((i) => (
                      <button
                        key={i.id}
                        aria-label={`查看物品${i.name}`}
                        onClick={() => navigate({ page: 'storage', detail: 'item', id: i.id })}
                      >
                        <ItemArt item={i} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="collection-leaves">
                  {leaf.slice(0, 4).map((f) => (
                    <button
                      className="collection-leaf"
                      title={folderPath(db.folders, f.id)
                        .map((p) => p.name)
                        .join(' / ')}
                      key={f.id}
                      onClick={() => open(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                  {leaf.length > 4 && (
                    <button className="collection-leaf" onClick={() => open(child.id)}>
                      全部 {leaf.length} 类
                    </button>
                  )}
                  {!leaf.length && (
                    <span className="leaf-count">
                      {sample.length
                        ? `${items.filter((i) => i.folderId && ids.has(i.folderId)).length} 件物品`
                        : '暂无下级内容'}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="collection-category-footer">
        <span>
          {children.length} 个下级分类 · {items.length} 件物品{folder.archived ? ' · 已归档' : ''}
        </span>
        <button className="text-button" onClick={() => open(folder.id)}>
          管理
          <ChevronRight size={13} />
        </button>
      </div>
    </section>
  );
}
