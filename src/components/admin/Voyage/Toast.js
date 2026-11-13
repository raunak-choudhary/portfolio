// src/components/admin/Voyage/Toast.js
//
// One quiet line at the bottom of the voyage for the result of a save, an
// upload or a reorder. The hook keeps a single message and clears it after a
// few seconds; a new message replaces the old one at once.

import React, { useCallback, useEffect, useRef, useState } from 'react';

export const TOAST_MS = 3600;

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const notify = useCallback((text, tone = 'ok') => {
    clearTimeout(timer.current);
    setToast({ text, tone, at: Date.now() });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, notify };
}

export default function Toast({ toast }) {
  return (
    <div className="voyage-toast-host" aria-live="polite" aria-atomic="true">
      {toast && <div key={toast.at} className={`voyage-toast voyage-toast--${toast.tone}`} role="status">{toast.text}</div>}
    </div>
  );
}
