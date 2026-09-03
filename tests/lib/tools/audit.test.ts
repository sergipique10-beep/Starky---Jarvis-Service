import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const rows = [
    { id: '1', tool_name: 'crear_recordatorio', risk_level: 2, input: {}, result: { success: true, message: 'ok' }, created_at: '2026-09-03T10:00:00Z' },
  ];
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ insert, select });
  return { getSupabaseClient: () => ({ from }) };
});

import { logToolExecution, getRecentAuditLog } from '@/lib/tools/audit';
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

describe('getRecentAuditLog', () => {
  it('returns the most recent audit_log rows, newest first, capped at the given limit', async () => {
    const rows = await getRecentAuditLog(20);

    const client = getSupabaseClient() as any;
    expect(client.from).toHaveBeenCalledWith('audit_log');
    expect(rows).toEqual([
      { id: '1', tool_name: 'crear_recordatorio', risk_level: 2, input: {}, result: { success: true, message: 'ok' }, created_at: '2026-09-03T10:00:00Z' },
    ]);
  });
});
