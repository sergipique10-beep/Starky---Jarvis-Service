import { describe, it, expect, vi } from 'vitest';

const { getRecentMessages, getPreferences, listRecentProjects } = vi.hoisted(() => ({
  getRecentMessages: vi.fn().mockResolvedValue([
    { role: 'summary', content: 'Resumen previo.', created_at: '2026-09-01T00:00:00Z' },
    { role: 'user', content: 'Hola Jarvis', created_at: '2026-09-02T10:00:00Z' },
  ]),
  getPreferences: vi.fn().mockResolvedValue({ tono: 'directo' }),
  listRecentProjects: vi.fn().mockResolvedValue([
    { name: 'FINANCE', status: 'paused', description: 'App de finanzas' },
  ]),
}));

vi.mock('@/lib/memory/conversations', () => ({ getRecentMessages: (...args: any[]) => getRecentMessages(...args) }));
vi.mock('@/lib/memory/preferences', () => ({ getPreferences: (...args: any[]) => getPreferences(...args) }));
vi.mock('@/lib/memory/projects', () => ({ listRecentProjects: (...args: any[]) => listRecentProjects(...args) }));

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

  it('falls back to a constant leading message when there is no preferences, projects, or summary content (fresh database)', async () => {
    getRecentMessages.mockResolvedValueOnce([]);
    getPreferences.mockResolvedValueOnce({});
    listRecentProjects.mockResolvedValueOnce([]);

    const messages = await buildContext('c1');

    expect(messages[0]).toEqual({ role: 'user', content: 'Sin contexto previo todavía.' });
    expect(messages[0].content.length).toBeGreaterThan(0);
    expect(messages.length).toBe(1);
  });
});
