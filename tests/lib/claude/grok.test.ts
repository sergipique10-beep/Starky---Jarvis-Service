import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToGrok } from '@/lib/claude/providers/grok';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.XAI_API_KEY = 'test-key';
  process.env.XAI_MODEL = 'grok-4-fast';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('sendToGrok', () => {
  it('maps a text-only response to a ClaudeTextBlock', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hola!' } }] }),
    }) as any;

    const response = await sendToGrok([{ role: 'user', content: 'hola' }], []);

    expect(response.blocks).toEqual([{ type: 'text', text: 'hola!' }]);
  });

  it('maps a tool_calls response to a ClaudeToolUse block', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call_1', function: { name: 'enviar_mail', arguments: '{"to":"a@b.com"}' } },
              ],
            },
          },
        ],
      }),
    }) as any;

    const response = await sendToGrok([{ role: 'user', content: 'mandale un mail a a@b.com' }], []);

    expect(response.blocks).toEqual([
      { type: 'tool_use', id: 'call_1', name: 'enviar_mail', input: { to: 'a@b.com' } },
    ]);
  });

  it('throws with the API error message when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'insufficient credits' } }),
    }) as any;

    await expect(sendToGrok([{ role: 'user', content: 'hola' }], [])).rejects.toThrow(
      'insufficient credits'
    );
  });

  it('throws when XAI_API_KEY is missing', async () => {
    delete process.env.XAI_API_KEY;

    await expect(sendToGrok([{ role: 'user', content: 'hola' }], [])).rejects.toThrow(
      'Missing XAI_API_KEY'
    );
  });
});
