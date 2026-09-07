import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToGroq } from '@/lib/claude/providers/groq';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-key';
  process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('sendToGroq', () => {
  it('maps a text-only response to a ClaudeTextBlock', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hola!' } }] }),
    }) as any;

    const response = await sendToGroq([{ role: 'user', content: 'hola' }], []);

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

    const response = await sendToGroq([{ role: 'user', content: 'mandale un mail a a@b.com' }], []);

    expect(response.blocks).toEqual([
      { type: 'tool_use', id: 'call_1', name: 'enviar_mail', input: { to: 'a@b.com' } },
    ]);
  });

  it('throws with the API error message when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'invalid model' } }),
    }) as any;

    await expect(sendToGroq([{ role: 'user', content: 'hola' }], [])).rejects.toThrow(
      'invalid model'
    );
  });

  it('throws when GROQ_API_KEY is missing', async () => {
    delete process.env.GROQ_API_KEY;

    await expect(sendToGroq([{ role: 'user', content: 'hola' }], [])).rejects.toThrow(
      'Missing GROQ_API_KEY'
    );
  });

  it('retries once after the rate-limit window and succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: { message: 'Rate limit reached ... Please try again in 2.5s.' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'hola!' } }] }),
      });
    global.fetch = fetchMock as any;

    const promise = sendToGroq([{ role: 'user', content: 'hola' }], []);
    await vi.advanceTimersByTimeAsync(2500);
    const response = await promise;

    expect(response.blocks).toEqual([{ type: 'text', text: 'hola!' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('throws the rate-limit error if the retry also fails', async () => {
    vi.useFakeTimers();
    const rateLimitResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({
        error: { message: 'Rate limit reached ... Please try again in 1s.' },
      }),
    };
    const fetchMock = vi.fn().mockResolvedValue(rateLimitResponse);
    global.fetch = fetchMock as any;

    const promise = sendToGroq([{ role: 'user', content: 'hola' }], []);
    const expectation = expect(promise).rejects.toThrow('Rate limit reached');
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
