import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockExecFile } = vi.hoisted(() => {
  return { mockExecFile: vi.fn() };
});

vi.mock('node:child_process', async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execFile: mockExecFile,
  };
});

beforeEach(() => {
  process.env.WPSCAN_API_TOKEN = 'test-token';
  mockExecFile.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

import { scanSecurity } from '@/lib/integrations/wpscan';

function mockWpscanOutput(json: object) {
  mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, callback: any) => {
    callback(null, JSON.stringify(json), '');
  });
}

describe('scanSecurity', () => {
  it('parses WordPress version, vulnerabilities, and plugins from wpscan JSON output', async () => {
    mockWpscanOutput({
      version: { number: '6.4.2' },
      vulnerabilities: [{ title: 'SQLi in Plugin X', severity: 'high', references: {} }],
      plugins: {
        'plugin-x': { version: { number: '1.2.0' }, vulnerabilities: [{ title: 'SQLi in Plugin X', severity: 'high' }] },
        'plugin-y': { version: { number: '3.0.0' }, vulnerabilities: [] },
      },
    });

    const result = await scanSecurity('https://example.com');

    expect(result.wpVersion).toBe('6.4.2');
    expect(result.plugins).toEqual([
      { name: 'plugin-x', version: '1.2.0' },
      { name: 'plugin-y', version: '3.0.0' },
    ]);
    expect(result.vulnerabilities).toEqual([
      { title: 'SQLi in Plugin X', severity: 'high', component: 'plugin-x' },
    ]);
  });

  it('passes the URL and API token as separate execFile arguments, never interpolated into a string', async () => {
    mockWpscanOutput({ version: null, vulnerabilities: [], plugins: {} });
    await scanSecurity('https://example.com');

    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('https://example.com');
    expect(args).toContain('test-token');
  });
});
