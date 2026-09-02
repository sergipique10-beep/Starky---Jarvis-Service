import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/conversations', () => ({
  getRecentMessages: vi.fn().mockResolvedValue([
    { role: 'summary', content: 'Resumen previo.', created_at: '2026-09-01T00:00:00Z' },
    { role: 'user', content: 'Hola Jarvis', created_at: '2026-09-02T10:00:00Z' },
  ]),
}));
vi.mock('@/lib/memory/preferences', () => ({
  getPreferences: vi.fn().mockResolvedValue({ tono: 'directo' }),
}));
vi.mock('@/lib/memory/projects', () => ({
  listRecentProjects: vi.fn().mockResolvedValue([
    { name: 'FINANCE', status: 'paused', description: 'App de finanzas' },
  ]),
}));

import { buildContext } from '@/lib/memory/context-builder';

describe('buildContext', () => {
  it('produces a leading context message plus the mapped conversation history', async () => {
    const messages = await buildContext('c1');

    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('tono: directo');
    expect(messages[0].content).toContain('FINANCE');
    expect(messages[0].content).toContain('Resumen previo.');

    expect(messages[1]).toEqual({ role: 'user', content: 'Hola Jarvis' });
  });
});
