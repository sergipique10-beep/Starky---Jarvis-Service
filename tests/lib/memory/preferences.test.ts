import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const select = vi.fn().mockResolvedValue({
    data: [{ key: 'tono', value: 'directo' }],
    error: null,
  });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { getSupabaseClient: () => ({ from }) };
});

import { getPreferences, setPreference } from '@/lib/memory/preferences';

describe('preferences memory', () => {
  it('returns all preferences as a key-value map', async () => {
    const prefs = await getPreferences();
    expect(prefs).toEqual({ tono: 'directo' });
  });

  it('sets a preference', async () => {
    await expect(setPreference('tono', 'formal')).resolves.toBeUndefined();
  });
});
