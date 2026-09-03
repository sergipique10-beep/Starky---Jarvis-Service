export interface PageSpeedResult {
  performanceScore: number;
  lcpMs: number;
  cls: number;
  strategy: 'mobile' | 'desktop';
}

export async function auditPerformance(url: string): Promise<PageSpeedResult> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
  });
  if (apiKey) params.set('key', apiKey);

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`PageSpeed Insights request failed with status ${response.status}`);
  }
  const body = await response.json();
  const audits = body.lighthouseResult.audits;

  return {
    performanceScore: Math.round(body.lighthouseResult.categories.performance.score * 100),
    lcpMs: audits['largest-contentful-paint'].numericValue,
    cls: audits['cumulative-layout-shift'].numericValue,
    strategy: 'mobile',
  };
}
