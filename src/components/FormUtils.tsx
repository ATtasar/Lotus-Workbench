import { useState } from 'react';
import { cloudMode } from '../lib/api';
export function useDraft<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const patch = (p: Partial<T>) => {
    setDirty(true);
    setValue((v) => ({ ...v, ...p }));
  };
  return { value, patch, dirty };
}
export function Footer({ label = '保存', busy = false }: { label?: string; busy?: boolean }) {
  return (
    <div className="form-footer">
      <button className="primary" type="submit" disabled={busy}>
        {label}
      </button>
      <span>{cloudMode ? '保存至个人云端工作区' : '保存在此浏览器'}</span>
    </div>
  );
}
