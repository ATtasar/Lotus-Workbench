import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { apiRequest, ApiError, cloudMode } from '../lib/api';
import { setCloudUser } from '../data/remoteRepository';
interface User {
  id: string;
  username: string;
}
const SessionContext = createContext<{ user: User | null; logout: () => Promise<void> }>({
  user: null,
  logout: async () => {},
});
export const useSession = () => useContext(SessionContext);
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(cloudMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  async function session() {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ user: User }>('/auth/session');
      setCloudUser(result.user.id);
      setUser(result.user);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setError(e instanceof Error ? e.message : '无法连接后端');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (cloudMode) void session();
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ user: User }>('/auth/login', { username, password });
      setCloudUser(result.user.id);
      setUser(result.user);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }
  if (cloudMode && !user)
    return (
      <div className="app-shell">
        <main className="page">
          <header className="page-header">
            <h1>创作者工作台</h1>
          </header>
          {loading ? (
            <p>正在检查登录状态。</p>
          ) : (
            <section className="paper detail-section">
              <h2>账号登录</h2>
              <form className="editor-form" onSubmit={login}>
                <label className="field full">
                  <span>账号</span>
                  <input
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label className="field full">
                  <span>密码</span>
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {error && <p role="alert">{error}</p>}
                <button className="primary wide" disabled={busy}>
                  {busy ? '正在登录…' : '登录'}
                </button>
                <button
                  type="button"
                  className="secondary wide"
                  disabled={busy}
                  onClick={() => void session()}
                >
                  重新连接
                </button>
              </form>
            </section>
          )}
        </main>
      </div>
    );
  return (
    <SessionContext.Provider
      value={{
        user,
        logout: async () => {
          await apiRequest('/auth/logout', {});
          setUser(null);
          setCloudUser('');
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
