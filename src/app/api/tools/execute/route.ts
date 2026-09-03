import { proposeManualAction } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { toolName, input } = await request.json();
  const result = await proposeManualAction(toolName, input);
  return Response.json(result);
}
