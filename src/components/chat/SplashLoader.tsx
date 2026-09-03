'use client';

import { useEffect, useState } from 'react';
import styles from './SplashLoader.module.css';

// Purely decorative: fixed overlay, pointer-events: none from the start, and it
// fades itself out via CSS (see SplashLoader.module.css) — it never blocks
// interaction with the chat underneath, so it needs no coordination with ChatWindow.
export default function SplashLoader() {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 1000;
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const next = Math.min(100, Math.round((elapsed / duration) * 100));
      setPercent(next);
      if (next >= 100) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.overlay} aria-hidden="true">
      <span className={styles.title}>JARVIS</span>
      <span className={styles.percent}>{percent}%</span>
    </div>
  );
}
