import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Orb from '@/components/orb/Orb';

vi.mock('jarvis-ai-web-animation', () => ({
  JarvisOrb: (props: Record<string, unknown>) => (
    <div data-testid="jarvis-orb" data-state={JSON.stringify(props.state)} />
  ),
}));

describe('Orb', () => {
  it('renders the JarvisOrb for each state without crashing', () => {
    for (const state of ['idle', 'listening', 'thinking', 'speaking'] as const) {
      const { container, unmount } = render(<Orb state={state} />);
      expect(container.querySelector('div')).toBeTruthy();
      unmount();
    }
  });
});
