import { describe, it, expect, vi } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = { create: mockCreate };
    },
  };
});

import { sendToClaude, summarizeWithClaude } from '@/lib/claude/client';

describe('claude client', () => {
  it('maps a text-only response to a ClaudeTextBlock', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hola!' }] });

    const response = await sendToClaude([{ role: 'user', content: 'hola' }], []);

    expect(response.blocks).toEqual([{ type: 'text', text: 'hola!' }]);
  });

  it('maps a tool_use response to a ClaudeToolUse block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'tu_1', name: 'enviar_mail', input: { to: 'a@b.com' } }],
    });

    const response = await sendToClaude([{ role: 'user', content: 'mandale un mail a a@b.com' }], []);

    expect(response.blocks).toEqual([
      { type: 'tool_use', id: 'tu_1', name: 'enviar_mail', input: { to: 'a@b.com' } },
    ]);
  });

  it('summarizeWithClaude returns the text block from a single-turn call', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Resumen breve.' }] });

    const summary = await summarizeWithClaude('conversación larga...');

    expect(summary).toBe('Resumen breve.');
  });
});
