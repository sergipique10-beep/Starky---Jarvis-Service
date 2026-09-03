import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/projects', () => ({
  listRecentProjects: vi.fn().mockResolvedValue([
    { name: 'W1', status: 'active', description: 'https://w1.example.com' },
    { name: 'W2', status: 'active', description: 'https://w2.example.com' },
  ]),
}));

const mockExecute = vi.fn();
vi.mock('@/lib/tools/catalog/auditarSitioWordpress', () => ({
  auditarSitioWordpress: { execute: (...args: any[]) => mockExecute(...args) },
}));

import { auditarTodosLosSitios } from '@/lib/tools/catalog/auditarTodosLosSitios';

describe('auditar_todos_los_sitios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is risk level 1 (read-only)', () => {
    expect(auditarTodosLosSitios.riskLevel).toBe(1);
  });

  it('audits every registered site and summarizes the results', async () => {
    mockExecute
      .mockResolvedValueOnce({ success: true, message: 'ok W1', data: { pdfPath: '/tmp/w1.pdf' } })
      .mockResolvedValueOnce({ success: true, message: 'ok W2', data: { pdfPath: '/tmp/w2.pdf' } });

    const result = await auditarTodosLosSitios.execute({}, { conversationId: 'c1' });

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.message).toContain('2 sitios');
    expect((result.data as any).pdfPaths).toEqual(['/tmp/w1.pdf', '/tmp/w2.pdf']);
  });

  it('reports a failing site without stopping the rest of the batch', async () => {
    mockExecute
      .mockResolvedValueOnce({ success: false, message: 'SSH caído en W1' })
      .mockResolvedValueOnce({ success: true, message: 'ok W2', data: { pdfPath: '/tmp/w2.pdf' } });

    const result = await auditarTodosLosSitios.execute({}, { conversationId: 'c1' });

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.message).toContain('1 falló');
    expect(result.message).toContain('SSH caído en W1');
    expect((result.data as any).pdfPaths).toEqual(['/tmp/w2.pdf']);
  });
});
