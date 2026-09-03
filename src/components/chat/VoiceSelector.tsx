import styles from './VoiceSelector.module.css';

export default function VoiceSelector({
  voices,
  voiceURI,
  onChange,
}: {
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  onChange: (uri: string) => void;
}) {
  if (voices.length === 0) return null;

  // Spanish voices first (most relevant for Jarvis's es-AR speech), then the rest.
  const sorted = [...voices].sort((a, b) => {
    const aEs = a.lang.startsWith('es') ? 0 : 1;
    const bEs = b.lang.startsWith('es') ? 0 : 1;
    return aEs - bEs;
  });

  return (
    <select
      className={styles.select}
      value={voiceURI ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Voz de Jarvis"
    >
      <option value="" disabled>
        Elegir voz…
      </option>
      {sorted.map((v) => (
        <option key={v.voiceURI} value={v.voiceURI}>
          {v.name} ({v.lang})
        </option>
      ))}
    </select>
  );
}
