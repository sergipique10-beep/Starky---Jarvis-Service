import { useCallback } from 'react';

export function useSpeechSynthesis() {
  const speak = useCallback((text: string, onStart?: () => void, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Web Speech API (TTS) no soportada en este navegador.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    window.speechSynthesis.speak(utterance);
  }, []);

  return { speak };
}
