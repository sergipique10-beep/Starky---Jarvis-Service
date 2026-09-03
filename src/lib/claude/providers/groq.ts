import type { ToolDefinition } from '@/lib/tools/types';
import type { ClaudeMessage, ClaudeResponse, ClaudeTextBlock, ClaudeToolUse } from '../client';

// Groq (groq.com — fast open-model inference, distinct from xAI's Grok) is
// also OpenAI-compatible, so this mirrors providers/grok.ts: adapt request/
// response into the same ClaudeResponse shape sendToClaude returns.
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

export async function sendToGroq(
  messages: ClaudeMessage[],
  tools: ToolDefinition[]
): Promise<ClaudeResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY');
  }
  const model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

  const res = await fetch(GROQ_BASE_URL, {
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
    throw new Error(`Groq API error: ${data.error?.message ?? res.statusText}`);
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
