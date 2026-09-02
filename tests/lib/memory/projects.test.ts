import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { name: 'FINANCE', status: 'paused', description: 'App de finanzas' },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { getSupabaseClient: () => ({ from }) };
});

import { getProject, upsertProject } from '@/lib/memory/projects';

describe('projects memory', () => {
  it('fetches a project by name', async () => {
    const project = await getProject('FINANCE');
    expect(project).toEqual({ name: 'FINANCE', status: 'paused', description: 'App de finanzas' });
  });

  it('upserts a project', async () => {
    await expect(
      upsertProject({ name: 'JARVIS', status: 'active', description: 'Asistente personal' })
    ).resolves.toBeUndefined();
  });
});
