import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import LoginForm from '@/app/login/LoginForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const AudioMock = vi.fn().mockImplementation(function (this: any) {
  this.volume = 0.3;
  this.play = vi.fn().mockRejectedValue(new Error('autoplay blocked'));
  this.pause = vi.fn();
});

describe('LoginForm music autoplay retry', () => {
  beforeEach(() => {
    AudioMock.mockClear();
    vi.stubGlobal('Audio', AudioMock);
  });

  it('retries starting the music on a later real gesture after an earlier attempt was blocked', async () => {
    const { container } = render(<LoginForm />);

    // Simulates the autoFocus-triggered call, which the browser rejects
    // because it isn't a genuine user gesture.
    fireEvent.focus(container.querySelector('input')!);
    await Promise.resolve();
    await Promise.resolve();

    // A real user gesture afterwards should retry, not stay silently blocked.
    fireEvent.click(container.firstChild!);

    expect(AudioMock).toHaveBeenCalledTimes(2);
  });
});
