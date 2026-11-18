// src/components/admin/Voyage/useOnline.js
//
// Whether the browser believes it has a network. navigator.onLine is only a
// hint (true can still mean a dead captive portal), so the dialog also sorts
// failed requests into a network kind; this hook covers the clear case, where
// the owner is told before pressing Save rather than after.

import { useEffect, useState } from 'react';

const read = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export default function useOnline() {
  const [online, setOnline] = useState(read);
  useEffect(() => {
    const update = () => setOnline(read());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}
