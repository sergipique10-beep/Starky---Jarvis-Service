import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';

describe('useSpeechSynthesis', () => {
  it('calls window.speechSynthesis.speak with an utterance built from the text', () => {
    const speak = vi.fn();
    (global as any).speechSynthesis = { speak };
    (global as any).SpeechSynthesisUtterance = function (text: string) {
      return { text };
    };

    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak('Hola, soy Jarvis'));

    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hola, soy Jarvis' }));
  });
});
