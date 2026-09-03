import { auditPerformance, type PageSpeedResult } from '@/lib/integrations/pagespeed';
import { scanSecurity, type WpScanResult, type WpScanPlugin } from '@/lib/integrations/wpscan';
import { gatherWpCliInventory, type WpCliDbInfo, type WpCliPluginStatus } from '@/lib/integrations/wpCliSsh';
import { getSiteCredentials } from '@/lib/memory/siteCredentials';

export type SectionResult<T> = { available: true; data: T } | { available: false; reason: string };

export interface WordpressAuditReport {
  siteName: string;
  url: string;
  generatedAt: string;
  performance: SectionResult<PageSpeedResult>;
  security: SectionResult<WpScanResult>;
  database: SectionResult<WpCliDbInfo>;
  plugins: SectionResult<{ external: WpScanPlugin[]; internal: WpCliPluginStatus[] }>;
}

async function toSectionResult<T>(promise: Promise<T>): Promise<SectionResult<T>> {
  try {
    const data = await promise;
    return { available: true, data };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function buildAuditReport(siteName: string, url: string): Promise<WordpressAuditReport> {
  const [performance, security] = await Promise.all([
    toSectionResult(auditPerformance(url)),
    toSectionResult(scanSecurity(url)),
  ]);

  const creds = await getSiteCredentials(siteName);
  const wpCliSection: SectionResult<Awaited<ReturnType<typeof gatherWpCliInventory>>> = creds
    ? await toSectionResult(gatherWpCliInventory(creds))
    : { available: false, reason: 'No hay credenciales SSH registradas para este sitio.' };

  const database: SectionResult<WpCliDbInfo> = wpCliSection.available
    ? { available: true, data: wpCliSection.data.db }
    : wpCliSection;

  const externalPlugins = security.available ? security.data.plugins : [];
  const internalPlugins = wpCliSection.available ? wpCliSection.data.plugins : [];
  const plugins: SectionResult<{ external: WpScanPlugin[]; internal: WpCliPluginStatus[] }> = {
    available: true,
    data: { external: externalPlugins, internal: internalPlugins },
  };

  return {
    siteName,
    url,
    generatedAt: new Date().toISOString(),
    performance,
    security,
    database,
    plugins,
  };
}
