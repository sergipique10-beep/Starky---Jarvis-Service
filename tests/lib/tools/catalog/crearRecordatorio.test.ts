import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  return { getSupabaseClient: () => ({ from }) };
});

import { crearRecordatorio } from '@/lib/tools/catalog/crearRecordatorio';

describe('crear_recordatorio', () => {
  it('is risk level 2 (reversible, low impact)', () => {
    expect(crearRecordatorio.riskLevel).toBe(2);
  });

  it('inserts a reminder into preferences-like storage and reports success', async () => {
    const result = await crearRecordatorio.execute(
      { text: 'Llamar al contador', due_at: '2026-09-10T10:00:00Z' },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('recordatorio');
  });
});
