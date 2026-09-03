import styles from './MuteButton.module.css';

export default function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      className={`${styles.button} ${muted ? styles.muted : ''}`}
      onClick={onToggle}
      aria-label={muted ? 'Activar voz de Jarvis' : 'Silenciar a Jarvis'}
      aria-pressed={muted}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
