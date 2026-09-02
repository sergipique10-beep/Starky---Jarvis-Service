import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  return { getSupabaseClient: () => ({ from }) };
});

import { logToolExecution } from '@/lib/tools/audit';
import { getSupabaseClient } from '@/lib/supabase/client';

describe('logToolExecution', () => {
  it('inserts a row into audit_log with the tool name, risk level, input and result', async () => {
    await logToolExecution('enviar_mail', 3, { to: 'a@b.com' }, { success: true, message: 'sent' });

    const client = getSupabaseClient() as any;
    expect(client.from).toHaveBeenCalledWith('audit_log');
    const insertCall = client.from.mock.results[0].value.insert;
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: 'enviar_mail',
        risk_level: 3,
        input: { to: 'a@b.com' },
        result: { success: true, message: 'sent' },
      })
    );
  });
});
