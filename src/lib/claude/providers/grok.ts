import type { ToolDefinition } from '@/lib/tools/types';
import type { ClaudeMessage, ClaudeResponse, ClaudeTextBlock, ClaudeToolUse } from '../client';

// xAI's API is OpenAI-compatible (chat completions shape), not Anthropic's —
// this adapts request/response into the same ClaudeResponse shape sendToClaude
// returns, so the orchestrator never has to know which provider answered.
const XAI_BASE_URL = 'https://api.x.ai/v1/chat/completions';

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenAiChatResponse {
  choices: {
    message: {
      content: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }[];
  error?: { message: string };
}

export async function sendToGrok(
  messages: ClaudeMessage[],
  tools: ToolDefinition[]
): Promise<ClaudeResponse> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing XAI_API_KEY');
  }
  const model = process.env.XAI_MODEL ?? 'grok-4-fast';

  const res = await fetch(XAI_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
    }),
  });

  const data = (await res.json()) as OpenAiChatResponse;
  if (!res.ok) {
    throw new Error(`Grok API error: ${data.error?.message ?? res.statusText}`);
  }

  const message = data.choices[0].message;
  const blocks: (ClaudeTextBlock | ClaudeToolUse)[] = [];

  if (message.content) {
    blocks.push({ type: 'text', text: message.content });
  }
  for (const call of message.tool_calls ?? []) {
    blocks.push({
      type: 'tool_use',
      id: call.id,
      name: call.function.name,
      input: JSON.parse(call.function.arguments),
    });
  }

  return { blocks };
}
