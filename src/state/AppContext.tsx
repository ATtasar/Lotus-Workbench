import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Database, Modal, Route } from '../data/types';
import { seedDatabase } from '../data/seed';
import { repository } from '../data/repository';
import { cloudMode, windowsLocalMode } from '../lib/api';
import { discardCloudDraft, exportCloudDraft, stageCloudDraft } from '../data/remoteRepository';

interface AppContextValue {
  db: Database;
  update: (fn: (db: Database) => Database) => void;
  route: Route;
  navigate: (route: Route) => void;
  back: () => void;
  modal: Modal | null;
  confirming: boolean;
  setModal: (modal: Modal | null) => void;
  toast: (message: string) => void;
  saveState: 'saved' | 'saving' | 'error';
  retrySave: () => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  confirm: (title: string, description: string, action: () => void) => void;
}
const Context = createContext<AppContextValue | null>(null);
export function useApp(): AppContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('AppProvider missing');
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [loadError, setLoadError] = useState('');
  const [routes, setRoutes] = useState<Route[]>([{ page: 'home' }]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [message, setMessage] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveRetry, setSaveRetry] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => void;
  } | null>(null);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const saveFailed = useRef(false);
  async function load() {
    setLoadError('');
    try {
      const stored = await repository.load();
      const data = stored ?? seedDatabase();
      if (!stored) await repository.save(data);
      setDb(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '无法读取数据');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!db) return;
    const current = ++revision.current;
    setSaveState('saving');
    saveFailed.current = false;
    setSaveError('');
    const staged = cloudMode ? stageCloudDraft(db) : Promise.resolve();
    void staged.catch(() => {});
    queue.current = queue.current
      .catch(() => {})
      .then(() => staged)
      .then(() => repository.save(db))
      .then(() => {
        if (current === revision.current) setSaveState('saved');
      })
      .catch((error) => {
        if (current === revision.current) {
          saveFailed.current = true;
          setSaveState('error');
          setSaveError(error instanceof Error ? error.message : '保存失败');
        }
      });
  }, [db, saveRetry]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!confirmation) return;
    const previous = document.activeElement as HTMLElement | null;
    const box = document.querySelector<HTMLElement>('.confirm-box');
    box?.querySelector<HTMLButtonElement>('button')?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmation(null);
      }
      if (e.key === 'Tab') {
        const buttons = box?.querySelectorAll('button');
        if (!buttons?.length) return;
        if (e.shiftKey && document.activeElement === buttons[0]) {
          e.preventDefault();
          buttons[buttons.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
          e.preventDefault();
          buttons[0].focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      if (previous?.isConnected) previous.focus();
    };
  }, [confirmation]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState]);
  const navigate = (route: Route) => {
    setRoutes((old) => (route.detail ? [...old, route] : [route]));
    window.scrollTo({ top: 0 });
  };
  if (!db)
    return (
      <div className="loading-screen">
        <span className="brand-seal">拾间</span>
        <h1>{loadError ? '暂时无法读取手记' : '正在打开你的手记'}</h1>
        <p>{loadError || '正在读取本地数据。'}</p>
        {loadError && (
          <>
            <button className="primary" onClick={() => void load()}>
              重新读取
            </button>
            {cloudMode ? (
              <>
                <button className="secondary" onClick={() => void exportCloudDraft()}>
                  导出未提交草稿
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    if (window.confirm('确认已导出需要保留的草稿？将放弃当前草稿并读取云端。'))
                      void discardCloudDraft().then(load);
                  }}
                >
                  读取云端，放弃草稿
                </button>
              </>
            ) : (
              <p>
                {windowsLocalMode
                  ? '请从桌面快捷方式启动本机服务；已有 SQLite 数据不会自动清空。'
                  : '请确认浏览器允许本站使用 IndexedDB；不会自动覆盖已有数据。'}
              </p>
            )}
          </>
        )}
      </div>
    );
  return (
    <Context.Provider
      value={{
        db,
        update: (fn) => setDb((old) => (old ? fn(old) : old)),
        route: routes[routes.length - 1],
        navigate,
        back: () => {
          setRoutes((old) => (old.length > 1 ? old.slice(0, -1) : [{ page: 'home' }]));
        },
        modal,
        confirming: !!confirmation,
        setModal,
        toast: (text) => {
          setMessage('');
          if (
            (cloudMode || windowsLocalMode) &&
            /已保存|已更新|已删除|已导入|已归档|已恢复|已清空|任务已完成/.test(text)
          ) {
            setMessage(windowsLocalMode ? '正在保存到本机…' : '正在保存至云端…');
            setTimeout(() => {
              void queue.current.then(() =>
                setMessage(
                  saveFailed.current
                    ? windowsLocalMode
                      ? '本机尚未保存，请导出备份后重试。'
                      : '云端尚未保存，请导出备份后重试。'
                    : text,
                ),
              );
            }, 0);
          } else setTimeout(() => setMessage(text), 0);
        },
        saveState,
        retrySave: () => setSaveRetry((v) => v + 1),
        selectedDate,
        setSelectedDate,
        confirm: (title, description, action) => setConfirmation({ title, description, action }),
      }}
    >
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      {saveState === 'error' && (
        <div className="save-error" role="alert">
          {cloudMode
            ? `云端保存失败：${saveError} 请先导出备份。`
            : windowsLocalMode
              ? `本机保存失败：${saveError} 请先导出备份。`
              : '本地保存失败，请先导出备份。'}
          <button onClick={() => setSaveRetry((v) => v + 1)}>重试</button>
        </div>
      )}
      {confirmation && (
        <div className="modal-overlay confirm-layer">
          <section
            className="confirm-box"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <span className="eyebrow">操作确认</span>
            <h2 id="confirm-title">{confirmation.title}</h2>
            <p>{confirmation.description}</p>
            <div className="button-pair">
              <button className="secondary" autoFocus onClick={() => setConfirmation(null)}>
                取消
              </button>
              <button
                className="danger"
                onClick={() => {
                  confirmation.action();
                  setConfirmation(null);
                }}
              >
                确认
              </button>
            </div>
          </section>
        </div>
      )}
    </Context.Provider>
  );
}
