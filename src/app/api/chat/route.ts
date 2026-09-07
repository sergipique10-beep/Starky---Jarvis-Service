import { handleUserMessage } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { conversationId, text } = await request.json();
  try {
    const result = await handleUserMessage(conversationId, text);
    return Response.json(result);
  } catch (error) {
    // Never let an unhandled error reach the client as an empty 500 body —
    // ChatWindow always calls res.json() on the response, so it needs valid JSON.
    console.error('handleUserMessage failed:', error);
    return Response.json(
      { type: 'message', text: 'Tuve un problema procesando tu mensaje. Probá de nuevo en unos segundos.' },
      { status: 500 }
    );
  }
}
