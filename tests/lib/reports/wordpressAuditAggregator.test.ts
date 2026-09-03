import { describe, it, expect, vi, beforeEach } from 'vitest';

const perf = { performanceScore: 91, lcpMs: 1800, cls: 0.02, strategy: 'mobile' as const };
const security = {
  wpVersion: '6.4.2',
  vulnerabilities: [],
  plugins: [{ name: 'akismet', version: '5.3' }],
};
const wpCli = {
  wpVersion: '6.4.2',
  phpVersion: 'PHP 8.1.10',
  plugins: [{ name: 'akismet', version: '5.3', status: 'active' as const }],
  db: { sizeMb: 42, largestTables: [{ name: 'wp_options', sizeMb: 12.5 }] },
};

vi.mock('@/lib/integrations/pagespeed', () => ({ auditPerformance: vi.fn() }));
vi.mock('@/lib/integrations/wpscan', () => ({ scanSecurity: vi.fn() }));
vi.mock('@/lib/integrations/wpCliSsh', () => ({ gatherWpCliInventory: vi.fn() }));
vi.mock('@/lib/memory/siteCredentials', () => ({ getSiteCredentials: vi.fn() }));

import { buildAuditReport } from '@/lib/reports/wordpressAuditAggregator';
import { auditPerformance } from '@/lib/integrations/pagespeed';
import { scanSecurity } from '@/lib/integrations/wpscan';
import { gatherWpCliInventory } from '@/lib/integrations/wpCliSsh';
import { getSiteCredentials } from '@/lib/memory/siteCredentials';

describe('buildAuditReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges all three sources when everything succeeds', async () => {
    (auditPerformance as any).mockResolvedValue(perf);
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue({ host: 'h', port: 22, username: 'u', privateKey: 'k' });
    (gatherWpCliInventory as any).mockResolvedValue(wpCli);

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.performance).toEqual({ available: true, data: perf });
    expect(report.security).toEqual({ available: true, data: security });
    expect(report.database).toEqual({ available: true, data: wpCli.db });
    expect(report.plugins).toEqual({
      available: true,
      data: { external: security.plugins, internal: wpCli.plugins },
    });
    expect(report.siteName).toBe('W1');
    expect(report.url).toBe('https://example.com');
  });

  it('marks the performance section unavailable when PageSpeed fails, without failing the whole report', async () => {
    (auditPerformance as any).mockRejectedValue(new Error('quota exceeded'));
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue({ host: 'h', port: 22, username: 'u', privateKey: 'k' });
    (gatherWpCliInventory as any).mockResolvedValue(wpCli);

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.performance).toEqual({ available: false, reason: 'quota exceeded' });
    expect(report.security.available).toBe(true);
  });

  it('marks the database section unavailable when no SSH credentials are registered', async () => {
    (auditPerformance as any).mockResolvedValue(perf);
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue(null);

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.database).toEqual({
      available: false,
      reason: 'No hay credenciales SSH registradas para este sitio.',
    });
    expect(gatherWpCliInventory).not.toHaveBeenCalled();
    // plugins section falls back to external-only data when internal data is unavailable
    expect(report.plugins).toEqual({ available: true, data: { external: security.plugins, internal: [] } });
  });

  it('marks the database section unavailable when the SSH connection fails', async () => {
    (auditPerformance as any).mockResolvedValue(perf);
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue({ host: 'h', port: 22, username: 'u', privateKey: 'k' });
    (gatherWpCliInventory as any).mockRejectedValue(new Error('connection reset'));

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.database).toEqual({ available: false, reason: 'connection reset' });
  });
});
