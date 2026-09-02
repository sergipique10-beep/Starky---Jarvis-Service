import { handleUserMessage } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { conversationId, text } = await request.json();
  const result = await handleUserMessage(conversationId, text);
  return Response.json(result);
}
