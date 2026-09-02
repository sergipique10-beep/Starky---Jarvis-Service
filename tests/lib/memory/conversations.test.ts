import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const order = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({
      data: [{ role: 'user', content: 'hola', created_at: '2026-09-02T10:00:00Z' }],
      error: null,
    }),
  });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, select });
  return { getSupabaseClient: () => ({ from }) };
});

import { appendMessage, getRecentMessages } from '@/lib/memory/conversations';

describe('conversations memory', () => {
  it('appends a message', async () => {
    await expect(appendMessage('c1', 'user', 'hola')).resolves.toBeUndefined();
  });

  it('returns recent messages for a conversation', async () => {
    const messages = await getRecentMessages('c1', 10);
    expect(messages).toEqual([{ role: 'user', content: 'hola', created_at: '2026-09-02T10:00:00Z' }]);
  });
});
