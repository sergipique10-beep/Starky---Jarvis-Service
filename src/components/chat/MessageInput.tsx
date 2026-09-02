import { useState } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

export default function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  const { start, isListening } = useSpeechRecognition((transcript) => {
    setValue(transcript);
  });

  function submit() {
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <div>
      <input
        placeholder="Escribile a Jarvis..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button onClick={start} aria-label="hablar">{isListening ? '🎙️...' : '🎙️'}</button>
      <button onClick={submit}>Enviar</button>
    </div>
  );
}
