import { buildContext } from '@/lib/memory/context-builder';
import { appendMessage } from '@/lib/memory/conversations';
import { sendToClaude, type ClaudeMessage } from '@/lib/claude/client';
import { TOOLS, getTool, getRiskLevel } from '@/lib/tools/registry';
import { logToolExecution } from '@/lib/tools/audit';
import { createPendingAction, getPendingAction, removePendingAction } from './pending-actions';

export type OrchestratorResponse =
  | { type: 'message'; text: string }
  | { type: 'confirmation_required'; pendingId: string; toolName: string; summary: string };

// A single model reply may chain several risk 1/2 tool calls before it's
// ready to answer in plain text (e.g. two reminders in one request) — this
// caps how many rounds we'll keep executing before giving up, so a model
// that never stops calling tools can't loop the request forever.
const MAX_TOOL_ROUNDS = 5;

export async function handleUserMessage(conversationId: string, text: string): Promise<OrchestratorResponse> {
  await appendMessage(conversationId, 'user', text);
  const messages = await buildContext(conversationId);
  return runConversationLoop(conversationId, messages);
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
  const messages: ClaudeMessage[] = [...context, toolResultMessage(pending.toolName, result.message)];
  const executed = new Set([toolSignature(pending.toolName, pending.input)]);
  return runConversationLoop(pending.conversationId, messages, executed);
}

// Shared by both entry points: keeps calling the model and executing any
// risk 1/2 tool it asks for, feeding the result back, until it answers with
// plain text (or a risk-3 tool call interrupts the loop for confirmation).
async function runConversationLoop(
  conversationId: string,
  initialMessages: ClaudeMessage[],
  alreadyExecuted: Set<string> = new Set()
): Promise<OrchestratorResponse> {
  let messages = initialMessages;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await sendToClaude(messages, TOOLS);
    const toolUse = response.blocks.find((b) => b.type === 'tool_use') as
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | undefined;

    if (!toolUse) {
      const finalText = extractText(response);
      await appendMessage(conversationId, 'assistant', finalText);
      return { type: 'message', text: finalText };
    }

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

    // Some models (esp. OpenAI-compatible ones without native tool_result
    // threading) re-propose the exact same call instead of moving on. Never
    // re-execute an identical call within one turn — a risk 1/2 tool still
    // has a real side effect, and duplicating it silently would be wrong.
    const signature = toolSignature(toolUse.name, toolUse.input);
    if (alreadyExecuted.has(signature)) {
      messages = [
        ...messages,
        toolResultMessage(toolUse.name, 'Ya se ejecutó esta acción antes en este turno, no hace falta repetirla.'),
      ];
      continue;
    }
    alreadyExecuted.add(signature);

    // risk level 1 or 2: execute immediately, then loop back so the model can
    // either chain another tool call or answer with the final text.
    const tool = getTool(toolUse.name)!;
    const result = await tool.execute(toolUse.input, { conversationId });
    await logToolExecution(toolUse.name, riskLevel, toolUse.input, result);

    messages = [...messages, toolResultMessage(toolUse.name, result.message)];
  }

  const fallback = 'Hice varias acciones seguidas y no llegué a resumírtelas — revisá el resultado directamente.';
  await appendMessage(conversationId, 'assistant', fallback);
  return { type: 'message', text: fallback };
}

function toolSignature(name: string, input: unknown): string {
  return `${name}:${JSON.stringify(input)}`;
}

// Fed back as a 'user' turn rather than 'assistant': this project's ClaudeMessage
// is a plain string, not real provider-native tool_result blocks, and OpenAI-
// compatible models (Groq/Grok) tend to re-propose the same call when the result
// arrives as an 'assistant' message instead of prompting them to continue.
function toolResultMessage(name: string, message: string): ClaudeMessage {
  return { role: 'user', content: `Resultado de la herramienta "${name}": ${message}` };
}

function extractText(response: { blocks: { type: string; text?: string }[] }): string {
  const textBlock = response.blocks.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}
