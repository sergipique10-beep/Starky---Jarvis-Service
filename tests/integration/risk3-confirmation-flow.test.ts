import { describe, it, expect, vi, afterEach } from 'vitest';

// This is an INTEGRATION test: it exercises the real API routes
// (src/app/api/chat/route.ts, src/app/api/confirm/route.ts) against the
// real orchestrator (src/lib/orchestrator/index.ts) and the real tool
// registry. Only the Claude client, the audit logger, and the Supabase
// client are faked/mocked — everything in between is real, unlike the
// unit tests in tests/lib/orchestrator/index.test.ts (which mock the
// orchestrator's dependencies directly) and tests/app/api/*.test.ts
// (which mock the orchestrator entirely).

// ---- Minimal in-memory fake Supabase client ----
// Supports exactly the query-builder shapes used by src/lib/memory/*.ts:
// select/eq/order/limit/maybeSingle/single, insert, upsert. Every stage
// is chainable AND thenable (like the real supabase-js query builder),
// so callers can await at whatever point they stop chaining.
function createChain(rows: any[]): any {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: (n: number) => createChain(rows.slice(0, n)),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return chain;
}

function createFakeSupabase() {
  const tables: Record<string, any[]> = {
    messages: [],
    preferences: [],
    projects: [],
    conversations: [],
  };

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);
    return {
      select: () => createChain(rows),
      insert: (row: any) => {
        const newRow = { id: `id-${rows.length}`, created_at: new Date().toISOString(), ...row };
        rows.push(newRow);
        return createChain([newRow]);
      },
      upsert: (row: any) => createChain([row]),
    };
  }

  return { from };
}

const fakeSupabase = createFakeSupabase();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => fakeSupabase,
}));

const { sendToClaude } = vi.hoisted(() => ({ sendToClaude: vi.fn() }));
vi.mock('@/lib/claude/client', () => ({
  sendToClaude: (...args: any[]) => sendToClaude(...args),
}));

const { logToolExecution } = vi.hoisted(() => ({ logToolExecution: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/tools/audit', () => ({
  logToolExecution: (...args: any[]) => logToolExecution(...args),
}));

// Real tool registry, real orchestrator, real API route handlers.
import { TOOLS } from '@/lib/tools/registry';
import { POST as chatPOST } from '@/app/api/chat/route';
import { POST as confirmPOST } from '@/app/api/confirm/route';

const enviarMailTool = TOOLS.find((t) => t.name === 'enviar_mail')!;

afterEach(() => {
  vi.restoreAllMocks();
  sendToClaude.mockReset();
  logToolExecution.mockClear();
});

describe('risk-3 confirmation round trip (real orchestrator + real API routes)', () => {
  it('routes a risk-3 tool call through confirmation, then executes it exactly once on confirm', async () => {
    const executeSpy = vi.spyOn(enviarMailTool, 'execute');

    sendToClaude.mockResolvedValueOnce({
      blocks: [
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'enviar_mail',
          input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' },
        },
      ],
    });

    const chatRequest = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId: 'conv-1', text: 'mandale un mail a juan' }),
    });
    const chatResponse = await chatPOST(chatRequest);
    const chatBody = await chatResponse.json();

    expect(chatBody.type).toBe('confirmation_required');
    expect(chatBody.pendingId).toBeTruthy();
    expect(executeSpy).not.toHaveBeenCalled();
    expect(logToolExecution).not.toHaveBeenCalled();

    sendToClaude.mockResolvedValueOnce({ blocks: [{ type: 'text', text: 'Listo, mail enviado.' }] });

    const confirmRequest = new Request('http://localhost/api/confirm', {
      method: 'POST',
      body: JSON.stringify({ pendingId: chatBody.pendingId, confirmed: true }),
    });
    const confirmResponse = await confirmPOST(confirmRequest);
    const confirmBody = await confirmResponse.json();

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(logToolExecution).toHaveBeenCalledTimes(1);
    expect(logToolExecution).toHaveBeenCalledWith('enviar_mail', 3, expect.anything(), expect.anything());
    expect(confirmBody).toEqual({ type: 'message', text: 'Listo, mail enviado.' });
  });
});
