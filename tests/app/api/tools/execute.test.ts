import { describe, it, expect, vi, afterEach } from 'vitest';

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
  const tables: Record<string, any[]> = { reminders: [], audit_log: [] };
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
vi.mock('@/lib/supabase/client', () => ({ getSupabaseClient: () => fakeSupabase }));

const { sendToClaude } = vi.hoisted(() => ({ sendToClaude: vi.fn() }));
vi.mock('@/lib/claude/client', () => ({ sendToClaude: (...args: any[]) => sendToClaude(...args) }));

import { TOOLS } from '@/lib/tools/registry';
import { POST as executePOST } from '@/app/api/tools/execute/route';
import { POST as confirmPOST } from '@/app/api/confirm/route';

const enviarMailTool = TOOLS.find((t) => t.name === 'enviar_mail')!;

afterEach(() => {
  vi.restoreAllMocks();
  sendToClaude.mockReset();
});

describe('POST /api/tools/execute', () => {
  it('executes a risk-level-2 tool immediately and returns the result', async () => {
    const request = new Request('http://localhost/api/tools/execute', {
      method: 'POST',
      body: JSON.stringify({ toolName: 'crear_recordatorio', input: { text: 'regar las plantas' } }),
    });

    const response = await executePOST(request);
    const body = await response.json();

    expect(sendToClaude).not.toHaveBeenCalled();
    expect(body).toEqual({ type: 'message', text: 'Listo, agendé el recordatorio: "regar las plantas".' });
  });

  it('never executes a risk-level-3 tool before confirmation, then executes it exactly once on confirm', async () => {
    const executeSpy = vi.spyOn(enviarMailTool, 'execute');

    const executeRequest = new Request('http://localhost/api/tools/execute', {
      method: 'POST',
      body: JSON.stringify({
        toolName: 'enviar_mail',
        input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' },
      }),
    });
    const executeResponse = await executePOST(executeRequest);
    const executeBody = await executeResponse.json();

    expect(executeBody.type).toBe('confirmation_required');
    expect(executeBody.pendingId).toBeTruthy();
    expect(executeSpy).not.toHaveBeenCalled();
    expect(sendToClaude).not.toHaveBeenCalled();

    const confirmRequest = new Request('http://localhost/api/confirm', {
      method: 'POST',
      body: JSON.stringify({ pendingId: executeBody.pendingId, confirmed: true }),
    });
    const confirmResponse = await confirmPOST(confirmRequest);
    const confirmBody = await confirmResponse.json();

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(sendToClaude).not.toHaveBeenCalled();
    expect(confirmBody).toEqual({ type: 'message', text: 'Mail enviado a juan@mail.com.' });
  });
});
