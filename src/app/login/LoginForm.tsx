'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './LoginForm.module.css';

export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Autoplay needs a real user gesture — this is idempotent so it's safe to
  // wire to every interaction on the screen (click, focus, keydown).
  function startMusic() {
    if (audioRef.current) return;
    const audio = new Audio('/audio/opening.mp3');
    audio.volume = 0.3; // background ambience, not the main event
    audioRef.current = audio;
    audio.play().catch(() => {
      // autoFocus fires this on mount without a real user gesture, so the
      // browser often rejects it — clear the ref so the next genuine
      // gesture (click, real focus, keypress) can retry instead of being
      // silently blocked forever.
      audioRef.current = null;
    });
  }

  function fadeOutMusic(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio) return resolve();
      const steps = 20;
      const startVolume = audio.volume;
      let step = 0;
      const id = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVolume * (1 - step / steps));
        if (step >= steps) {
          clearInterval(id);
          audio.pause();
          resolve();
        }
      }, durationMs / steps);
    });
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message ?? 'Contraseña incorrecta.');
        return;
      }
      await fadeOutMusic(1200); // dissolves while "connecting", instead of cutting abruptly
      const redirectTo = searchParams.get('from') || '/';
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('No se pudo conectar. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrapper} onClick={startMusic}>
      <div className={styles.card}>
        <span className={styles.title}>JARVIS</span>
        <input
          className={styles.input}
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={startMusic}
          onKeyDown={(e) => e.key === 'Enter' && !loading && submit()}
          autoFocus
        />
        {error && <span className={styles.error}>{error}</span>}
        <button className={styles.button} onClick={submit} disabled={loading}>
          {loading ? 'Verificando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
