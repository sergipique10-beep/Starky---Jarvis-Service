import { useState, useEffect } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import styles from './MessageInput.module.css';

export default function MessageInput({
  onSend,
  onListeningChange
}: {
  onSend: (text: string) => void;
  onListeningChange?: (isListening: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const { start, isListening } = useSpeechRecognition((transcript) => {
    setValue(transcript);
  });

  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  function submit() {
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <div className={styles.bar}>
      <input
        className={styles.input}
        placeholder="Escribile a Jarvis..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button
        className={`${styles.iconButton} ${isListening ? styles.iconButtonActive : ''}`}
        onClick={start}
        aria-label="hablar"
      >
        🎙️
      </button>
      <button className={styles.sendButton} onClick={submit}>
        Enviar
      </button>
    </div>
  );
}
