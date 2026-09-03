import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJson = vi.fn();
beforeEach(() => {
  process.env.PAGESPEED_API_KEY = 'test-key';
  mockJson.mockReset();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson }) as any;
});

import { auditPerformance } from '@/lib/integrations/pagespeed';

describe('auditPerformance', () => {
  it('parses performance score and Core Web Vitals from the API response', async () => {
    mockJson.mockResolvedValue({
      lighthouseResult: {
        categories: { performance: { score: 0.87 } },
        audits: {
          'largest-contentful-paint': { numericValue: 2100 },
          'cumulative-layout-shift': { numericValue: 0.05 },
        },
      },
    });

    const result = await auditPerformance('https://example.com');

    expect(result).toEqual({ performanceScore: 87, lcpMs: 2100, cls: 0.05, strategy: 'mobile' });
    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('url=https%3A%2F%2Fexample.com');
    expect(calledUrl).toContain('strategy=mobile');
    expect(calledUrl).toContain('key=test-key');
  });

  it('throws a descriptive error when the API responds with an error status', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500, json: mockJson });
    await expect(auditPerformance('https://example.com')).rejects.toThrow(/PageSpeed/);
  });
});
