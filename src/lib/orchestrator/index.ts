import { buildContext } from '@/lib/memory/context-builder';
import { appendMessage } from '@/lib/memory/conversations';
import { sendToClaude, type ClaudeMessage } from '@/lib/claude/client';
import { TOOLS, getTool, getRiskLevel } from '@/lib/tools/registry';
import { logToolExecution } from '@/lib/tools/audit';
import { createPendingAction, getPendingAction, removePendingAction } from './pending-actions';

export type OrchestratorResponse =
  | { type: 'message'; text: string }
  | { type: 'confirmation_required'; pendingId: string; toolName: string; summary: string };

export async function handleUserMessage(conversationId: string, text: string): Promise<OrchestratorResponse> {
  await appendMessage(conversationId, 'user', text);

  const messages: ClaudeMessage[] = await buildContext(conversationId);

  const response = await sendToClaude(messages, TOOLS);

  const toolUse = response.blocks.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; id: string; name: string; input: unknown }
    | undefined;

  if (toolUse) {
    const riskLevel = getRiskLevel(toolUse.name);

    if (riskLevel === 3) {
      // CRITICAL INVARIANT: a risk-level-3 tool call must NEVER be executed here.
      // We only record it as pending and return a confirmation request. The
      // actual execute() call for this tool can only happen inside
      // handleConfirmation, and only when confirmed === true.
      const pending = createPendingAction(conversationId, toolUse.name, toolUse.input, toolUse.id);
      const summary = `¿Confirmás ejecutar "${toolUse.name}" con estos datos? ${JSON.stringify(toolUse.input)}`;
      return { type: 'confirmation_required', pendingId: pending.id, toolName: toolUse.name, summary };
    }

    // risk level 1 or 2: execute immediately
    const tool = getTool(toolUse.name)!;
    const result = await tool.execute(toolUse.input, { conversationId });
    await logToolExecution(toolUse.name, riskLevel, toolUse.input, result);

    const followUp = await sendToClaude(
      [...messages, { role: 'assistant', content: `[tool ${toolUse.name} executed] ${result.message}` }],
      TOOLS
    );
    const finalText = extractText(followUp);
    await appendMessage(conversationId, 'assistant', finalText);
    return { type: 'message', text: finalText };
  }

  const finalText = extractText(response);
  await appendMessage(conversationId, 'assistant', finalText);
  return { type: 'message', text: finalText };
}

export async function handleConfirmation(pendingId: string, confirmed: boolean): Promise<OrchestratorResponse> {
  const pending = getPendingAction(pendingId);
  if (!pending) {
    return { type: 'message', text: 'Esa confirmación ya expiró o no existe.' };
  }
  // Remove immediately so this pending action can never be replayed/executed twice,
  // regardless of the confirmed/rejected branch taken below.
  removePendingAction(pendingId);

  if (!confirmed) {
    return { type: 'message', text: 'Ok, no lo hago.' };
  }

  const tool = getTool(pending.toolName)!;
  const riskLevel = getRiskLevel(pending.toolName);
  const result = await tool.execute(pending.input, { conversationId: pending.conversationId });
  await logToolExecution(pending.toolName, riskLevel, pending.input, result);

  const context = await buildContext(pending.conversationId);
  const followUp = await sendToClaude(
    [...context, { role: 'assistant', content: `[tool ${pending.toolName} executed] ${result.message}` }],
    TOOLS
  );
  const finalText = extractText(followUp);
  await appendMessage(pending.conversationId, 'assistant', finalText);
  return { type: 'message', text: finalText };
}

function extractText(response: { blocks: { type: string; text?: string }[] }): string {
  const textBlock = response.blocks.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}
