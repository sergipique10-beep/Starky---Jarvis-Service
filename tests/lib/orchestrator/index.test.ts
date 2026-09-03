import { describe, it, expect, vi, beforeEach } from 'vitest';

const { appendMessage, sendToClaude, logToolExecution, fakeExecute, fakeSendMailExecute } = vi.hoisted(() => ({
  appendMessage: vi.fn().mockResolvedValue(undefined),
  sendToClaude: vi.fn(),
  logToolExecution: vi.fn().mockResolvedValue(undefined),
  fakeExecute: vi.fn().mockResolvedValue({ success: true, message: 'Recordatorio creado.' }),
  fakeSendMailExecute: vi.fn().mockResolvedValue({ success: true, message: 'Mail enviado.' }),
}));

vi.mock('@/lib/memory/conversations', () => ({ appendMessage: (...args: any[]) => appendMessage(...args) }));
vi.mock('@/lib/memory/context-builder', () => ({
  buildContext: vi.fn().mockResolvedValue([{ role: 'user', content: 'contexto previo' }]),
}));

vi.mock('@/lib/claude/client', () => ({ sendToClaude: (...args: any[]) => sendToClaude(...args) }));

vi.mock('@/lib/tools/audit', () => ({ logToolExecution: (...args: any[]) => logToolExecution(...args) }));

vi.mock('@/lib/tools/registry', () => ({
  TOOLS: [
    { name: 'crear_recordatorio', description: '', riskLevel: 2, inputSchema: {}, execute: fakeExecute },
    { name: 'enviar_mail', description: '', riskLevel: 3, inputSchema: {}, execute: fakeSendMailExecute },
  ],
  getTool: (name: string) =>
    name === 'crear_recordatorio'
      ? { name, riskLevel: 2, execute: fakeExecute }
      : name === 'enviar_mail'
      ? { name, riskLevel: 3, execute: fakeSendMailExecute }
      : undefined,
  getRiskLevel: (name: string) => (name === 'crear_recordatorio' ? 2 : 3),
}));

import { handleUserMessage, handleConfirmation } from '@/lib/orchestrator/index';

beforeEach(() => {
  fakeExecute.mockClear();
  fakeSendMailExecute.mockClear();
  logToolExecution.mockClear();
  sendToClaude.mockClear();
});

describe('orchestrator risk gating', () => {
  it('executes a risk-level-2 tool call immediately and returns the final message', async () => {
    sendToClaude
      .mockResolvedValueOnce({
        blocks: [{ type: 'tool_use', id: 'tu_1', name: 'crear_recordatorio', input: { text: 'llamar al contador' } }],
      })
      .mockResolvedValueOnce({ blocks: [{ type: 'text', text: 'Listo, ya lo agendé.' }] });

    const result = await handleUserMessage('c1', 'recordame llamar al contador');

    expect(fakeExecute).toHaveBeenCalledTimes(1);
    expect(logToolExecution).toHaveBeenCalledWith('crear_recordatorio', 2, expect.anything(), expect.anything());
    expect(result).toEqual({ type: 'message', text: 'Listo, ya lo agendé.' });
  });

  it('NEVER executes a risk-level-3 tool call before confirmation', async () => {
    sendToClaude.mockResolvedValueOnce({
      blocks: [
        { type: 'tool_use', id: 'tu_2', name: 'enviar_mail', input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' } },
      ],
    });

    const result = await handleUserMessage('c1', 'mandale un mail a juan');

    expect(fakeSendMailExecute).not.toHaveBeenCalled();
    expect(result.type).toBe('confirmation_required');
    if (result.type === 'confirmation_required') {
      expect(result.toolName).toBe('enviar_mail');
      expect(result.pendingId).toBeTruthy();
    }
  });

  it('executes the risk-level-3 tool only after explicit confirmation, and logs it', async () => {
    sendToClaude.mockResolvedValueOnce({
      blocks: [
        { type: 'tool_use', id: 'tu_3', name: 'enviar_mail', input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' } },
      ],
    });
    const pending = await handleUserMessage('c1', 'mandale un mail a juan');
    if (pending.type !== 'confirmation_required') throw new Error('expected confirmation_required');

    sendToClaude.mockResolvedValueOnce({ blocks: [{ type: 'text', text: 'Listo, mail enviado.' }] });

    const result = await handleConfirmation(pending.pendingId, true);

    expect(fakeSendMailExecute).toHaveBeenCalledTimes(1);
    expect(logToolExecution).toHaveBeenCalledWith('enviar_mail', 3, expect.anything(), expect.anything());
    expect(result).toEqual({ type: 'message', text: 'Listo, mail enviado.' });
  });

  it('chains multiple risk-level-2 tool calls in one turn before returning the final text', async () => {
    sendToClaude
      .mockResolvedValueOnce({
        blocks: [{ type: 'tool_use', id: 'tu_5a', name: 'crear_recordatorio', input: { text: 'llamar al contador' } }],
      })
      .mockResolvedValueOnce({
        blocks: [{ type: 'tool_use', id: 'tu_5b', name: 'crear_recordatorio', input: { text: 'regar las plantas' } }],
      })
      .mockResolvedValueOnce({ blocks: [{ type: 'text', text: 'Listo, agendé los dos recordatorios.' }] });

    const result = await handleUserMessage('c1', 'creame dos recordatorios');

    expect(fakeExecute).toHaveBeenCalledTimes(2);
    expect(sendToClaude).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ type: 'message', text: 'Listo, agendé los dos recordatorios.' });
  });

  it('never re-executes an identical tool call proposed twice in the same turn', async () => {
    const sameInput = { text: 'llamar al contador' };
    sendToClaude
      .mockResolvedValueOnce({
        blocks: [{ type: 'tool_use', id: 'tu_6a', name: 'crear_recordatorio', input: sameInput }],
      })
      .mockResolvedValueOnce({
        // A confused model re-proposes the exact same call instead of moving on.
        blocks: [{ type: 'tool_use', id: 'tu_6b', name: 'crear_recordatorio', input: sameInput }],
      })
      .mockResolvedValueOnce({ blocks: [{ type: 'text', text: 'Listo, ya lo agendé.' }] });

    const result = await handleUserMessage('c1', 'recordame llamar al contador');

    expect(fakeExecute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ type: 'message', text: 'Listo, ya lo agendé.' });
  });

  it('does not execute a risk-level-3 tool if the user rejects the confirmation', async () => {
    sendToClaude.mockResolvedValueOnce({
      blocks: [
        { type: 'tool_use', id: 'tu_4', name: 'enviar_mail', input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' } },
      ],
    });
    const pending = await handleUserMessage('c1', 'mandale un mail a juan');
    if (pending.type !== 'confirmation_required') throw new Error('expected confirmation_required');

    const result = await handleConfirmation(pending.pendingId, false);

    expect(fakeSendMailExecute).not.toHaveBeenCalled();
    expect(result).toEqual({ type: 'message', text: 'Ok, no lo hago.' });
  });
});
