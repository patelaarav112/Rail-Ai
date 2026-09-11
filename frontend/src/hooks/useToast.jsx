import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

const ICON = { success: '✓', error: '✕', warn: '!', info: 'i' };
const COLOR = {
  success: 'var(--accent-green)',
  error: 'var(--accent-red)',
  warn: 'var(--accent-yellow)',
  info: 'var(--accent-blue)',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((type, msg) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, type, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  function dismiss(id) {
    setToasts(t => t.filter(x => x.id !== id));
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
            <span className="toast-icon" style={{ color: COLOR[t.type], background: COLOR[t.type] + '1a', borderColor: COLOR[t.type] + '40' }}>
              {ICON[t.type]}
            </span>
            <span className="toast-msg">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx.showToast;
};
