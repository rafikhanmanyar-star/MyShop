import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Ctx = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setMsg(message);
    window.setTimeout(() => setMsg(null), 3800);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {msg ? (
        <div className="toast" role="status">
          {msg}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastContext);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}
