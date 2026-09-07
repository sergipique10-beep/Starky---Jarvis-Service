import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consultarRepoGithub } from '@/lib/tools/catalog/consultarRepoGithub';

const originalToken = process.env.GITHUB_TOKEN;

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  };
}

describe('consultar_repos_github', () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it('is risk level 1 (read-only)', () => {
    expect(consultarRepoGithub.riskLevel).toBe(1);
  });

  it('finds a repo by partial, case-insensitive match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse([
          {
            name: 'Starky---Jarvis-Service',
            full_name: 'sergipique10-beep/Starky---Jarvis-Service',
            description: 'Jarvis assistant service',
            private: true,
            pushed_at: '2026-09-01T00:00:00Z',
            html_url: 'https://github.com/sergipique10-beep/Starky---Jarvis-Service',
          },
        ])
      )
    );

    const result = await consultarRepoGithub.execute({ name: 'JARVIS' }, { conversationId: 'c1' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'Starky---Jarvis-Service',
      description: 'Jarvis assistant service',
      private: true,
      pushedAt: '2026-09-01T00:00:00Z',
      url: 'https://github.com/sergipique10-beep/Starky---Jarvis-Service',
    });
  });

  it('returns success:false when no repo matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse([])));

    const result = await consultarRepoGithub.execute({ name: 'NOPE' }, { conversationId: 'c1' });

    expect(result.success).toBe(false);
  });

  it('returns success:false when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;

    const result = await consultarRepoGithub.execute({ name: 'JARVIS' }, { conversationId: 'c1' });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/GITHUB_TOKEN/);
  });
});
