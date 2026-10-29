import { useEffect, useState } from 'react';

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function toast(message: string): void {
  for (const l of listeners) l(message);
}

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const listener: Listener = (m) => {
      setMsg(m);
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 2500);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!msg) return null;
  return <div id="toast" className={visible ? 'show' : ''}>{msg}</div>;
}