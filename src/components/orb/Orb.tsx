'use client';

import { JarvisOrb, type JarvisStateTarget } from 'jarvis-ai-web-animation';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

// 'idle' and 'thinking' map straight to the package's built-in moods.
// 'listening' and 'speaking' aren't built in, so they're custom state
// targets — 'listening' calmer (matches STT capture), 'speaking' more
// energetic (matches TTS output), both busier than idle/thinking.
const CUSTOM_STATE_TARGETS: Record<'listening' | 'speaking', JarvisStateTarget> = {
  listening: {
    energy: 1.4,
    rotationSpeed: 0.6,
    particleSpeed: 1.6,
    shellRadius: 1.08,
    ringSpread: 1.0,
    filamentOpacity: 0.7,
    coreScale: 1.1,
    bloom: 0.9,
  },
  speaking: {
    energy: 1.8,
    rotationSpeed: 0.9,
    particleSpeed: 2.0,
    shellRadius: 1.12,
    ringSpread: 1.15,
    filamentOpacity: 0.85,
    coreScale: 1.18,
    bloom: 1.1,
  },
};

export default function Orb({ state }: { state: OrbState }) {
  const target = state === 'idle' || state === 'thinking' ? state : CUSTOM_STATE_TARGETS[state];

  return (
    <div style={{ width: 220, height: 220 }}>
      <JarvisOrb size="hero" state={target} palette="cyan" ariaLabel="Jarvis" />
    </div>
  );
}
