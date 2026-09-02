import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/projects', () => ({
  getProject: vi.fn().mockResolvedValue({
    name: 'FINANCE',
    status: 'paused',
    description: 'App de finanzas personales',
  }),
}));

import { consultarEstadoProyecto } from '@/lib/tools/catalog/consultarEstadoProyecto';

describe('consultar_estado_proyecto', () => {
  it('is risk level 1 (read-only)', () => {
    expect(consultarEstadoProyecto.riskLevel).toBe(1);
  });

  it('returns the project status as tool result data', async () => {
    const result = await consultarEstadoProyecto.execute(
      { name: 'FINANCE' },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'FINANCE',
      status: 'paused',
      description: 'App de finanzas personales',
    });
  });
});
