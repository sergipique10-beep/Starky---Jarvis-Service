import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/memory/projects', () => ({
  getProject: vi.fn().mockResolvedValue({ name: 'W1', status: 'active', description: 'https://example.com' }),
}));
vi.mock('@/lib/reports/wordpressAuditAggregator', () => ({
  buildAuditReport: vi.fn().mockResolvedValue({
    siteName: 'W1',
    url: 'https://example.com',
    generatedAt: '2026-09-05T10:00:00.000Z',
    performance: { available: true, data: { performanceScore: 91, lcpMs: 1800, cls: 0.02, strategy: 'mobile' as const } },
    security: { available: true, data: { wpVersion: '6.4.2', vulnerabilities: [], plugins: [] } },
    database: { available: true, data: { sizeMb: 42, largestTables: [] } },
    plugins: { available: true, data: { external: [], internal: [] } },
  }),
}));
vi.mock('@/lib/reports/wordpressAuditHtml', () => ({ renderAuditReportHtml: vi.fn().mockReturnValue('<html></html>') }));
vi.mock('@/lib/reports/pdfGenerator', () => ({ generatePdf: vi.fn().mockResolvedValue(undefined) }));

import { auditarSitioWordpress } from '@/lib/tools/catalog/auditarSitioWordpress';
import { buildAuditReport } from '@/lib/reports/wordpressAuditAggregator';
import { generatePdf } from '@/lib/reports/pdfGenerator';

const report = {
  siteName: 'W1',
  url: 'https://example.com',
  generatedAt: '2026-09-05T10:00:00.000Z',
  performance: { available: true, data: { performanceScore: 91, lcpMs: 1800, cls: 0.02, strategy: 'mobile' as const } },
  security: { available: true, data: { wpVersion: '6.4.2', vulnerabilities: [], plugins: [] } },
  database: { available: true, data: { sizeMb: 42, largestTables: [] } },
  plugins: { available: true, data: { external: [], internal: [] } },
};

describe('auditar_sitio_wordpress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is risk level 1 (read-only)', () => {
    expect(auditarSitioWordpress.riskLevel).toBe(1);
  });

  it('looks up the site by name, builds the report, and generates a PDF', async () => {
    const result = await auditarSitioWordpress.execute({ sitio: 'W1' }, { conversationId: 'c1' });

    expect(buildAuditReport).toHaveBeenCalledWith('W1', 'https://example.com');
    expect(generatePdf).toHaveBeenCalledWith('<html></html>', expect.stringContaining('W1'));
    expect(result.success).toBe(true);
    expect(result.message).toContain('91');
  });

  it('fails clearly when the site is not registered', async () => {
    const { getProject } = await import('@/lib/memory/projects');
    (getProject as any).mockResolvedValueOnce(null);

    const result = await auditarSitioWordpress.execute({ sitio: 'UNKNOWN' }, { conversationId: 'c1' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('UNKNOWN');
    expect(buildAuditReport).not.toHaveBeenCalled();
  });
});
