import { proposeManualAction } from '@/lib/orchestrator';
import { getTool } from '@/lib/tools/registry';

export async function POST(request: Request): Promise<Response> {
  try {
    const { toolName, input } = await request.json();

    if (!getTool(toolName)) {
      return Response.json({ error: `Unknown tool: ${toolName}` }, { status: 404 });
    }

    const result = await proposeManualAction(toolName, input);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
