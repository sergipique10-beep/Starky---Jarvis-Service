import { useState } from 'react';

export default function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');

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
      <button onClick={submit}>Enviar</button>
    </div>
  );
}
