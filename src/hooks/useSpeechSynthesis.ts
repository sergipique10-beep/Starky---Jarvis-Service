import { useCallback } from 'react';

export function useSpeechSynthesis() {
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Web Speech API (TTS) no soportada en este navegador.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    window.speechSynthesis.speak(utterance);
  }, []);

  return { speak };
}
