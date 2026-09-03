import { describe, it, expect } from 'vitest';
import { renderAuditReportHtml } from '@/lib/reports/wordpressAuditHtml';
import type { WordpressAuditReport } from '@/lib/reports/wordpressAuditAggregator';

const baseReport: WordpressAuditReport = {
  siteName: 'W1',
  url: 'https://example.com',
  generatedAt: '2026-09-05T10:00:00.000Z',
  performance: { available: true, data: { performanceScore: 91, lcpMs: 1800, cls: 0.02, strategy: 'mobile' } },
  security: { available: true, data: { wpVersion: '6.4.2', vulnerabilities: [], plugins: [] } },
  database: { available: true, data: { sizeMb: 42, largestTables: [{ name: 'wp_options', sizeMb: 12.5 }] } },
  plugins: { available: true, data: { external: [{ name: 'akismet', version: '5.3' }], internal: [] } },
};

describe('renderAuditReportHtml', () => {
  it('includes the site name, URL, and performance score', () => {
    const html = renderAuditReportHtml(baseReport);
    expect(html).toContain('W1');
    expect(html).toContain('https://example.com');
    expect(html).toContain('91');
  });

  it('shows "no disponible" for an unavailable section instead of throwing', () => {
    const report: WordpressAuditReport = {
      ...baseReport,
      database: { available: false, reason: 'No hay credenciales SSH registradas para este sitio.' },
    };
    const html = renderAuditReportHtml(report);
    expect(html).toContain('no disponible');
    expect(html).toContain('No hay credenciales SSH registradas para este sitio.');
  });
});
