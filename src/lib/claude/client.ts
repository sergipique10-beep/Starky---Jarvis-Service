import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition } from '@/lib/tools/types';
import { sendToGrok } from './providers/grok';
import { sendToGroq } from './providers/groq';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

export interface ClaudeResponse {
  blocks: (ClaudeTextBlock | ClaudeToolUse)[];
}

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function sendToClaude(
  messages: ClaudeMessage[],
  tools: ToolDefinition[]
): Promise<ClaudeResponse> {
  // LLM_PROVIDER lets the orchestrator run against Grok/Groq instead of Claude
  // (e.g. while testing without Anthropic credit) without any caller caring —
  // every path returns the same ClaudeResponse shape.
  if (process.env.LLM_PROVIDER === 'grok') {
    return sendToGrok(messages, tools);
  }
  if (process.env.LLM_PROVIDER === 'groq') {
    return sendToGroq(messages, tools);
  }

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as any,
    })),
  });

  const blocks = (response.content as any[]).map((block) => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text } as ClaudeTextBlock;
    }
    return { type: 'tool_use', id: block.id, name: block.name, input: block.input } as ClaudeToolUse;
  });

  return { blocks };
}

export async function summarizeWithClaude(text: string): Promise<string> {
  const response = await sendToClaude(
    [
      {
        role: 'user',
        content: `Resumí en 3-4 oraciones lo más importante de esta conversación, en español, sin perder decisiones tomadas:\n\n${text}`,
      },
    ],
    []
  );
  const textBlock = response.blocks.find((b) => b.type === 'text') as ClaudeTextBlock | undefined;
  return textBlock?.text ?? '';
}
