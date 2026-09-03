import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.WPSCAN_API_TOKEN = 'test-token';
  process.env.CREDENTIALS_MASTER_KEY = Buffer.alloc(32, 3).toString('base64');
});

vi.mock('@/lib/supabase/client', () => {
  const projectsTable = {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'W1', status: 'active', description: 'https://w1.example.com' }, error: null }) }) }),
  };
  const siteCredentialsTable = {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  };
  return {
    getSupabaseClient: () => ({
      from: (table: string) => (table === 'projects' ? projectsTable : siteCredentialsTable),
    }),
  };
});

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    lighthouseResult: {
      categories: { performance: { score: 0.95 } },
      audits: {
        'largest-contentful-paint': { numericValue: 1500 },
        'cumulative-layout-shift': { numericValue: 0.01 },
      },
    },
  }),
}) as any;

vi.mock('node:child_process', () => ({
  execFile: (_bin: string, _args: string[], _opts: any, callback: any) => {
    callback(
      null,
      JSON.stringify({
        version: { number: '6.4.2' },
        vulnerabilities: [],
        plugins: { akismet: { version: { number: '5.3' }, vulnerabilities: [] } },
      }),
      ''
    );
  },
}));

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { auditarSitioWordpress } from '@/lib/tools/catalog/auditarSitioWordpress';

describe('WordPress audit — full single-site flow', () => {
  it('produces a successful result with a PDF path when only external sources are available', async () => {
    const result = await auditarSitioWordpress.execute({ sitio: 'W1' }, { conversationId: 'c1' });

    expect(result.success).toBe(true);
    expect(result.message).toContain('95');
    expect((result.data as any).pdfPath).toContain('W1');
    expect((result.data as any).report.database).toEqual({
      available: false,
      reason: 'No hay credenciales SSH registradas para este sitio.',
    });
  });
});
