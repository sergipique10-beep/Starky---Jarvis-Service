import { useRef, useState, useCallback } from 'react';

export function useSpeechRecognition(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const instanceRef = useRef<any>(null);

  const start = useCallback(() => {
    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!Recognition) {
      console.warn('Web Speech API no soportada en este navegador.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'es-AR';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
    instanceRef.current = recognition;
    setIsListening(true);
  }, [onResult]);

  const stop = useCallback(() => {
    instanceRef.current?.stop();
    setIsListening(false);
  }, []);

  return { start, stop, isListening, _debugInstance: instanceRef.current };
}
