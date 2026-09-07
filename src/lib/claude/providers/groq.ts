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

// Groq's free/on-demand tier has a tight tokens-per-minute cap, and its 429
// response tells us exactly how long the window has left ("Please try again
// in 2.5s") — retrying once after that wait turns a transient cap-hit into a
// success instead of a hard failure for the user.
interface RateLimitError extends Error {
  isRateLimit: true;
  retryDelayMs: number;
}

function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof Error && 'isRateLimit' in error;
}

function parseRetryDelayMs(message: string): number {
  const match = message.match(/try again in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : 1000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(
  apiKey: string,
  model: string,
  messages: ClaudeMessage[],
  tools: ToolDefinition[]
): Promise<OpenAiChatResponse> {
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
    if (res.status === 429) {
      const rateLimitError: RateLimitError = Object.assign(
        new Error(`Groq API error: ${data.error?.message ?? res.statusText}`),
        { isRateLimit: true as const, retryDelayMs: parseRetryDelayMs(data.error?.message ?? '') }
      );
      throw rateLimitError;
    }
    throw new Error(`Groq API error: ${data.error?.message ?? res.statusText}`);
  }
  return data;
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

  let data: OpenAiChatResponse;
  try {
    data = await callGroq(apiKey, model, messages, tools);
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    await delay(error.retryDelayMs);
    data = await callGroq(apiKey, model, messages, tools);
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
