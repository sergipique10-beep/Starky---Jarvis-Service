import { useCallback, useEffect, useState } from 'react';
import { sanitizeForSpeech } from '@/lib/speech/sanitizeForSpeech';

const VOICE_STORAGE_KEY = 'jarvis_voice_uri';
const MUTED_STORAGE_KEY = 'jarvis_muted';

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

    const storedVoice = localStorage.getItem(VOICE_STORAGE_KEY);
    if (storedVoice) setVoiceURIState(storedVoice);
    setMutedState(localStorage.getItem(MUTED_STORAGE_KEY) === 'true');

    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const setVoiceURI = useCallback((uri: string) => {
    setVoiceURIState(uri);
    localStorage.setItem(VOICE_STORAGE_KEY, uri);
  }, []);

  const toggleMuted = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      localStorage.setItem(MUTED_STORAGE_KEY, String(next));
      if (next) window.speechSynthesis?.cancel(); // stop anything currently speaking
      return next;
    });
  }, []);

  const speak = useCallback(
    (text: string, onStart?: () => void, onEnd?: () => void) => {
      if (muted) {
        // Muted: skip straight to onEnd so orbState still resets out of 'thinking'.
        if (onEnd) onEnd();
        return;
      }
      if (!('speechSynthesis' in window)) {
        console.warn('Web Speech API (TTS) no soportada en este navegador.');
        // Guarantee onEnd is called even if TTS isn't available
        if (onEnd) onEnd();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(sanitizeForSpeech(text));
      utterance.lang = 'es-AR';
      const selected = voices.find((v) => v.voiceURI === voiceURI);
      if (selected) utterance.voice = selected;
      if (onStart) utterance.onstart = onStart;
      if (onEnd) utterance.onend = onEnd;
      window.speechSynthesis.speak(utterance);
    },
    [voices, voiceURI, muted]
  );

  return { speak, voices, voiceURI, setVoiceURI, muted, toggleMuted };
}
