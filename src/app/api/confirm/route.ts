import { handleConfirmation } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { pendingId, confirmed } = await request.json();
  const result = await handleConfirmation(pendingId, confirmed);
  return Response.json(result);
}
