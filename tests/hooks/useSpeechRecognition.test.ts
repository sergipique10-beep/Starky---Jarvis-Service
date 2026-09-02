import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

class FakeRecognition {
  onresult: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

beforeEach(() => {
  (global as any).webkitSpeechRecognition = FakeRecognition;
});

describe('useSpeechRecognition', () => {
  it('calls onResult with the transcribed text', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(onResult));

    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);

    const recognitionInstance: FakeRecognition = (result.current as any)._debugInstance;
    act(() => {
      recognitionInstance.onresult?.({
        results: [[{ transcript: 'hola jarvis' }]],
      });
    });

    expect(onResult).toHaveBeenCalledWith('hola jarvis');
  });
});
