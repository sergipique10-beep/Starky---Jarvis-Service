import { handleConfirmation } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { pendingId, confirmed } = await request.json();
  try {
    const result = await handleConfirmation(pendingId, confirmed);
    return Response.json(result);
  } catch (error) {
    console.error('handleConfirmation failed:', error);
    return Response.json(
      { type: 'message', text: 'Tuve un problema confirmando esa acción. Probá de nuevo en unos segundos.' },
      { status: 500 }
    );
  }
}
