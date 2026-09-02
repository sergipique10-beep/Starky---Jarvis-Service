import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const messages = [
    { role: 'user', content: 'msg1', created_at: '2026-09-01T10:00:00Z' },
    { role: 'assistant', content: 'msg2', created_at: '2026-09-01T10:01:00Z' },
    { role: 'user', content: 'msg3', created_at: '2026-09-02T10:00:00Z' },
    { role: 'assistant', content: 'msg4', created_at: '2026-09-02T10:01:00Z' },
  ];

  const order = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ data: [...messages].reverse(), error: null }),
  });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq: deleteEq, lt: vi.fn().mockReturnValue({ eq: deleteEq }) });
  const from = vi.fn().mockReturnValue({ select, insert, delete: del });
  return { getSupabaseClient: () => ({ from }) };
});

import { summarizeOldMessages } from '@/lib/memory/conversations';

describe('summarizeOldMessages', () => {
  it('summarizes everything except the last N messages and inserts a summary row', async () => {
    const summarize = vi.fn().mockResolvedValue('Resumen: msg1, msg2');

    await summarizeOldMessages('c1', 2, summarize);

    expect(summarize).toHaveBeenCalledWith(expect.stringContaining('msg1'));
    expect(summarize).toHaveBeenCalledWith(expect.stringContaining('msg2'));
  });
});
