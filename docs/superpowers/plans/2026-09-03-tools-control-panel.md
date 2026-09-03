# Tools Control Panel + Macros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/panel` page that lists every registered tool, lets the user trigger any of them directly through an auto-generated form ("macro"), and shows a recent audit-log history — without duplicating the risk-3 confirmation invariant that already lives in the chat orchestrator.

**Architecture:** A new API route (`/api/tools/execute`) mirrors the chat orchestrator's risk-gating logic by calling a new `proposeManualAction` function that reuses the existing `pending-actions` store and, for risk-3 tools, the existing `/api/confirm` endpoint. `pending-actions` and `ToolContext` are widened to make `conversationId` optional so panel-originated actions (which have no conversation) fit the same types. The panel UI is a server component (fetches tools + audit log) wrapping a client component that owns the interactive state (form submission, confirmation review, result/error display).

**Tech Stack:** Next.js App Router, TypeScript, Vitest + Testing Library (same stack as the rest of the project — no new dependencies).

**Spec:** `docs/superpowers/specs/2026-09-03-tools-control-panel-design.md`

## Global Constraints

- The panel never re-implements risk-3 gating — it only calls the existing `pending-actions` store and `/api/confirm`, exactly like the chat does (per spec "Por qué reusar pending-actions y /api/confirm").
- `ConfirmationBanner` (`src/components/chat/ConfirmationBanner.tsx`) is reused as-is for the panel's risk-3 review — no new confirmation component is created (per spec "Componentes de UI").
- The panel adds no new tools — it only reads `TOOLS` from the existing registry (per spec "Decisiones de alcance").
- MCP connectivity is out of scope for this plan entirely (per spec "Fuera de alcance").

---

## File Structure

```
src/
  lib/
    tools/
      types.ts                        # MODIFY: ToolContext.conversationId becomes optional
      audit.ts                        # MODIFY: add getRecentAuditLog
    orchestrator/
      pending-actions.ts              # MODIFY: conversationId/toolUseId become optional
      index.ts                        # MODIFY: add proposeManualAction; handleConfirmation
                                       #         skips the LLM follow-up when there's no conversationId
  app/
    api/
      tools/
        execute/route.ts              # CREATE: POST -> proposeManualAction
    panel/
      page.tsx                        # CREATE: server component, fetches TOOLS + audit log
  components/
    panel/
      DynamicForm.tsx                 # CREATE: renders inputs from a tool's inputSchema
      DynamicForm.module.css          # CREATE
      ToolCard.tsx                    # CREATE: name, description, risk badge, DynamicForm
      ToolCard.module.css             # CREATE
      AuditLogList.tsx                # CREATE: renders recent audit_log rows
      AuditLogList.module.css         # CREATE
      PanelClient.tsx                 # CREATE: client component owning all panel interaction state
      PanelClient.module.css          # CREATE
    chat/
      ChatWindow.tsx                  # MODIFY: add a link to /panel in the controls row
      ChatWindow.module.css           # MODIFY: add .panelLink style
tests/
  lib/
    tools/
      audit.test.ts                   # MODIFY: add getRecentAuditLog test
  lib/
    orchestrator/
      index.test.ts                   # MODIFY: add proposeManualAction + no-conversationId tests
  app/
    api/
      tools/
        execute.test.ts               # CREATE
  components/
    panel/
      DynamicForm.test.tsx            # CREATE
      PanelClient.test.tsx            # CREATE
  components/
    chat/
      ChatWindow.test.tsx             # MODIFY: assert the /panel link renders
```

**Responsibility boundaries:**
- `DynamicForm` never talks to the network — it only turns a JSON Schema into inputs and calls `onSubmit(values)` with a plain object.
- `PanelClient` is the only panel component that calls `fetch` — `ToolCard` and `AuditLogList` are pure presentational components driven by props.
- `proposeManualAction` never talks to Claude — unlike `handleUserMessage`, it executes a tool directly (or creates a pending action), it never calls `sendToClaude`.

---

## Task 1: Widen shared types + add `getRecentAuditLog`

**Files:**
- Modify: `src/lib/tools/types.ts`, `src/lib/orchestrator/pending-actions.ts`, `src/lib/tools/audit.ts`
- Test: `tests/lib/tools/audit.test.ts`

**Interfaces:**
- Produces:
  - `ToolContext { conversationId?: string }` (was `conversationId: string`)
  - `PendingAction { id: string; conversationId?: string; toolName: string; input: unknown; toolUseId?: string }`
  - `createPendingAction(toolName: string, input: unknown, conversationId?: string, toolUseId?: string): PendingAction`
  - `getRecentAuditLog(limit: number): Promise<AuditLogRow[]>` where
    `AuditLogRow = { id: string; tool_name: string; risk_level: number; input: unknown; result: { success: boolean; message: string }; created_at: string }`

- [ ] **Step 1: Widen `ToolContext`**

In `src/lib/tools/types.ts`, change:

```ts
export interface ToolContext {
  conversationId: string;
}
```

to:

```ts
export interface ToolContext {
  conversationId?: string;
}
```

- [ ] **Step 2: Widen `PendingAction` and reorder `createPendingAction`'s params**

`src/lib/orchestrator/pending-actions.ts` — replace the whole file:

```ts
import { randomUUID } from 'node:crypto';

export interface PendingAction {
  id: string;
  conversationId?: string;
  toolName: string;
  input: unknown;
  toolUseId?: string;
}

const store = new Map<string, PendingAction>();

export function createPendingAction(
  toolName: string,
  input: unknown,
  conversationId?: string,
  toolUseId?: string
): PendingAction {
  const action: PendingAction = { id: randomUUID(), conversationId, toolName, input, toolUseId };
  store.set(action.id, action);
  return action;
}

export function getPendingAction(id: string): PendingAction | undefined {
  return store.get(id);
}

export function removePendingAction(id: string): void {
  store.delete(id);
}
```

Note the parameter order changed (`toolName, input` now come first, `conversationId`/`toolUseId` are optional and last) — this is a breaking change for the one existing caller in `src/lib/orchestrator/index.ts`, fixed in Task 2.

- [ ] **Step 3: Write the failing test for `getRecentAuditLog`**

Add to `tests/lib/tools/audit.test.ts` (append, keep the existing `logToolExecution` describe block and its `vi.mock` above untouched — extend the mock to also support `select`/`order`/`limit`):

```ts
vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const rows = [
    { id: '1', tool_name: 'crear_recordatorio', risk_level: 2, input: {}, result: { success: true, message: 'ok' }, created_at: '2026-09-03T10:00:00Z' },
  ];
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ insert, select });
  return { getSupabaseClient: () => ({ from }) };
});

import { getRecentAuditLog } from '@/lib/tools/audit';

describe('getRecentAuditLog', () => {
  it('returns the most recent audit_log rows, newest first, capped at the given limit', async () => {
    const rows = await getRecentAuditLog(20);

    const client = getSupabaseClient() as any;
    expect(client.from).toHaveBeenCalledWith('audit_log');
    expect(rows).toEqual([
      { id: '1', tool_name: 'crear_recordatorio', risk_level: 2, input: {}, result: { success: true, message: 'ok' }, created_at: '2026-09-03T10:00:00Z' },
    ]);
  });
});
```

Also add `import { getSupabaseClient } from '@/lib/supabase/client';` to the top of the test file if it isn't already imported.

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/audit.test.ts`
Expected: FAIL (`getRecentAuditLog` is not exported)

- [ ] **Step 5: Implement `getRecentAuditLog`**

Append to `src/lib/tools/audit.ts`:

```ts
export interface AuditLogRow {
  id: string;
  tool_name: string;
  risk_level: number;
  input: unknown;
  result: { success: boolean; message: string };
  created_at: string;
}

export async function getRecentAuditLog(limit: number): Promise<AuditLogRow[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('audit_log')
    .select('id, tool_name, risk_level, input, result, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch audit log: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/audit.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/types.ts src/lib/orchestrator/pending-actions.ts src/lib/tools/audit.ts tests/lib/tools/audit.test.ts
git commit -m "feat: widen ToolContext/PendingAction to allow panel-originated actions, add getRecentAuditLog"
```

---

## Task 2: Orchestrator — `proposeManualAction` + conversation-less confirmation

**Files:**
- Modify: `src/lib/orchestrator/index.ts`
- Test: `tests/lib/orchestrator/index.test.ts`

**Interfaces:**
- Consumes: `createPendingAction(toolName, input, conversationId?, toolUseId?)` (Task 1), `getTool`, `getRiskLevel` (`@/lib/tools/registry`), `logToolExecution` (`@/lib/tools/audit`).
- Produces: `proposeManualAction(toolName: string, input: unknown): Promise<OrchestratorResponse>` — risk 1/2 executes immediately and returns `{ type: 'message', text }`; risk 3 creates a pending action (no `conversationId`) and returns `{ type: 'confirmation_required', ... }`, never executing.
- Modifies existing behavior: `handleConfirmation` — when `pending.conversationId` is `undefined`, skips `buildContext`/`sendToClaude` entirely and returns `{ type: 'message', text: result.message }` directly.

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/orchestrator/index.test.ts`, inside the existing `describe('orchestrator risk gating', ...)` block (it already mocks `sendToClaude`, `TOOLS`, `getTool`, `getRiskLevel`, `logToolExecution`, `fakeExecute`, `fakeSendMailExecute` — reuse those, no new mocks needed):

```ts
  it('proposeManualAction executes a risk-level-2 tool immediately, with no LLM call', async () => {
    const result = await proposeManualAction('crear_recordatorio', { text: 'regar las plantas' });

    expect(fakeExecute).toHaveBeenCalledTimes(1);
    expect(fakeExecute).toHaveBeenCalledWith({ text: 'regar las plantas' }, { conversationId: undefined });
    expect(logToolExecution).toHaveBeenCalledWith('crear_recordatorio', 2, expect.anything(), expect.anything());
    expect(sendToClaude).not.toHaveBeenCalled();
    expect(result).toEqual({ type: 'message', text: 'Recordatorio creado.' });
  });

  it('proposeManualAction NEVER executes a risk-level-3 tool before confirmation', async () => {
    const result = await proposeManualAction('enviar_mail', { to: 'juan@mail.com', subject: 'Hola', body: 'Test' });

    expect(fakeSendMailExecute).not.toHaveBeenCalled();
    expect(sendToClaude).not.toHaveBeenCalled();
    expect(result.type).toBe('confirmation_required');
    if (result.type === 'confirmation_required') {
      expect(result.toolName).toBe('enviar_mail');
      expect(result.pendingId).toBeTruthy();
    }
  });

  it('confirming a panel-originated (conversation-less) risk-3 action executes it without calling the LLM', async () => {
    const pending = await proposeManualAction('enviar_mail', { to: 'juan@mail.com', subject: 'Hola', body: 'Test' });
    if (pending.type !== 'confirmation_required') throw new Error('expected confirmation_required');

    const result = await handleConfirmation(pending.pendingId, true);

    expect(fakeSendMailExecute).toHaveBeenCalledTimes(1);
    expect(logToolExecution).toHaveBeenCalledWith('enviar_mail', 3, expect.anything(), expect.anything());
    expect(sendToClaude).not.toHaveBeenCalled();
    expect(result).toEqual({ type: 'message', text: 'Mail enviado.' });
  });
```

Update the import line near the top of the file:

```ts
import { handleUserMessage, handleConfirmation, proposeManualAction } from '@/lib/orchestrator/index';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/orchestrator/index.test.ts`
Expected: FAIL (`proposeManualAction` is not exported; the conversation-less confirmation test fails because `handleConfirmation` still calls `sendToClaude`)

- [ ] **Step 3: Implement `proposeManualAction` and adapt `handleConfirmation`**

Replace `src/lib/orchestrator/index.ts` with:

```ts
import { buildContext } from '@/lib/memory/context-builder';
import { appendMessage } from '@/lib/memory/conversations';
import { sendToClaude, type ClaudeMessage } from '@/lib/claude/client';
import { TOOLS, getTool, getRiskLevel } from '@/lib/tools/registry';
import { logToolExecution } from '@/lib/tools/audit';
import { createPendingAction, getPendingAction, removePendingAction } from './pending-actions';

export type OrchestratorResponse =
  | { type: 'message'; text: string }
  | { type: 'confirmation_required'; pendingId: string; toolName: string; summary: string };

// A single model reply may chain several risk 1/2 tool calls before it's
// ready to answer in plain text (e.g. two reminders in one request) — this
// caps how many rounds we'll keep executing before giving up, so a model
// that never stops calling tools can't loop the request forever.
const MAX_TOOL_ROUNDS = 5;

export async function handleUserMessage(conversationId: string, text: string): Promise<OrchestratorResponse> {
  await appendMessage(conversationId, 'user', text);
  const messages = await buildContext(conversationId);
  return runConversationLoop(conversationId, messages);
}

// Triggered from the tools control panel — no conversation, no LLM turn.
// Risk 1/2 tools run immediately; risk 3 tools go through the exact same
// pending-action gate the chat uses, just without a conversationId.
export async function proposeManualAction(toolName: string, input: unknown): Promise<OrchestratorResponse> {
  const riskLevel = getRiskLevel(toolName);

  if (riskLevel === 3) {
    const pending = createPendingAction(toolName, input);
    const summary = `¿Confirmás ejecutar "${toolName}" con estos datos? ${JSON.stringify(input)}`;
    return { type: 'confirmation_required', pendingId: pending.id, toolName, summary };
  }

  const tool = getTool(toolName)!;
  const result = await tool.execute(input, { conversationId: undefined });
  await logToolExecution(toolName, riskLevel, input, result);
  return { type: 'message', text: result.message };
}

export async function handleConfirmation(pendingId: string, confirmed: boolean): Promise<OrchestratorResponse> {
  const pending = getPendingAction(pendingId);
  if (!pending) {
    return { type: 'message', text: 'Esa confirmación ya expiró o no existe.' };
  }
  // Remove immediately so this pending action can never be replayed/executed twice,
  // regardless of the confirmed/rejected branch taken below.
  removePendingAction(pendingId);

  if (!confirmed) {
    return { type: 'message', text: 'Ok, no lo hago.' };
  }

  const tool = getTool(pending.toolName)!;
  const riskLevel = getRiskLevel(pending.toolName);
  const result = await tool.execute(pending.input, { conversationId: pending.conversationId });
  await logToolExecution(pending.toolName, riskLevel, pending.input, result);

  // Panel-originated action: no conversation to reply into, and no point
  // asking the model to narrate a result nobody in a chat will read.
  if (!pending.conversationId) {
    return { type: 'message', text: result.message };
  }

  const context = await buildContext(pending.conversationId);
  const messages: ClaudeMessage[] = [...context, toolResultMessage(pending.toolName, result.message)];
  const executed = new Set([toolSignature(pending.toolName, pending.input)]);
  return runConversationLoop(pending.conversationId, messages, executed);
}

// Shared by both entry points: keeps calling the model and executing any
// risk 1/2 tool it asks for, feeding the result back, until it answers with
// plain text (or a risk-3 tool call interrupts the loop for confirmation).
async function runConversationLoop(
  conversationId: string,
  initialMessages: ClaudeMessage[],
  alreadyExecuted: Set<string> = new Set()
): Promise<OrchestratorResponse> {
  let messages = initialMessages;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await sendToClaude(messages, TOOLS);
    const toolUse = response.blocks.find((b) => b.type === 'tool_use') as
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | undefined;

    if (!toolUse) {
      const finalText = extractText(response);
      await appendMessage(conversationId, 'assistant', finalText);
      return { type: 'message', text: finalText };
    }

    const riskLevel = getRiskLevel(toolUse.name);

    if (riskLevel === 3) {
      // CRITICAL INVARIANT: a risk-level-3 tool call must NEVER be executed here.
      // We only record it as pending and return a confirmation request. The
      // actual execute() call for this tool can only happen inside
      // handleConfirmation, and only when confirmed === true.
      const pending = createPendingAction(toolUse.name, toolUse.input, conversationId, toolUse.id);
      const summary = `¿Confirmás ejecutar "${toolUse.name}" con estos datos? ${JSON.stringify(toolUse.input)}`;
      return { type: 'confirmation_required', pendingId: pending.id, toolName: toolUse.name, summary };
    }

    // Some models (esp. OpenAI-compatible ones without native tool_result
    // threading) re-propose the exact same call instead of moving on. Never
    // re-execute an identical call within one turn — a risk 1/2 tool still
    // has a real side effect, and duplicating it silently would be wrong.
    const signature = toolSignature(toolUse.name, toolUse.input);
    if (alreadyExecuted.has(signature)) {
      messages = [
        ...messages,
        toolResultMessage(toolUse.name, 'Ya se ejecutó esta acción antes en este turno, no hace falta repetirla.'),
      ];
      continue;
    }
    alreadyExecuted.add(signature);

    // risk level 1 or 2: execute immediately, then loop back so the model can
    // either chain another tool call or answer with the final text.
    const tool = getTool(toolUse.name)!;
    const result = await tool.execute(toolUse.input, { conversationId });
    await logToolExecution(toolUse.name, riskLevel, toolUse.input, result);

    messages = [...messages, toolResultMessage(toolUse.name, result.message)];
  }

  const fallback = 'Hice varias acciones seguidas y no llegué a resumírtelas — revisá el resultado directamente.';
  await appendMessage(conversationId, 'assistant', fallback);
  return { type: 'message', text: fallback };
}

function toolSignature(name: string, input: unknown): string {
  return `${name}:${JSON.stringify(input)}`;
}

// Fed back as a 'user' turn rather than 'assistant': this project's ClaudeMessage
// is a plain string, not real provider-native tool_result blocks, and OpenAI-
// compatible models (Groq/Grok) tend to re-propose the same call when the result
// arrives as an 'assistant' message instead of prompting them to continue.
function toolResultMessage(name: string, message: string): ClaudeMessage {
  return { role: 'user', content: `Resultado de la herramienta "${name}": ${message}` };
}

function extractText(response: { blocks: { type: string; text?: string }[] }): string {
  const textBlock = response.blocks.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}
```

(This is the existing file with `proposeManualAction` added, `createPendingAction` calls updated to the new parameter order from Task 1, and the `if (!pending.conversationId)` short-circuit added to `handleConfirmation`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/lib/orchestrator/index.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/index.ts tests/lib/orchestrator/index.test.ts
git commit -m "feat: add proposeManualAction for panel-triggered tool execution"
```

---

## Task 3: `POST /api/tools/execute`

**Files:**
- Create: `src/app/api/tools/execute/route.ts`
- Test: `tests/app/api/tools/execute.test.ts`

**Interfaces:**
- Consumes: `proposeManualAction(toolName, input)` (Task 2), the real `TOOLS` registry, real `handleConfirmation` (for the confirm leg of the round trip, via the existing `/api/confirm` route).
- Produces: `POST /api/tools/execute` — body `{ toolName: string, input: unknown }` → `Response.json(OrchestratorResponse)`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/app/api/tools/execute.test.ts` — this follows the exact same fake-Supabase-client pattern as `tests/integration/risk3-confirmation-flow.test.ts` (real orchestrator, real registry, real route handlers; only Supabase, Claude, and the audit logger are faked):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/app/api/tools/execute.test.ts`
Expected: FAIL (module `@/app/api/tools/execute/route` does not exist)

- [ ] **Step 3: Implement the route**

`src/app/api/tools/execute/route.ts`:

```ts
import { proposeManualAction } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { toolName, input } = await request.json();
  const result = await proposeManualAction(toolName, input);
  return Response.json(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/app/api/tools/execute.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm run test`
Expected: PASS (all files, including `tests/integration/risk3-confirmation-flow.test.ts` — the chat's risk-3 flow is untouched)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tools/execute/route.ts tests/app/api/tools/execute.test.ts
git commit -m "feat: add POST /api/tools/execute for panel-triggered tool calls"
```

---

## Task 4: `DynamicForm`

**Files:**
- Create: `src/components/panel/DynamicForm.tsx`, `src/components/panel/DynamicForm.module.css`
- Test: `tests/components/panel/DynamicForm.test.tsx`

**Interfaces:**
- Produces: `<DynamicForm schema={ToolInputSchema} onSubmit={(values: Record<string, unknown>) => void} disabled={boolean} submitLabel={string} />` where
  `ToolInputSchema = { type: 'object'; properties: Record<string, { type: string; format?: string; enum?: string[]; items?: { type: string } }>; required?: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/panel/DynamicForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DynamicForm from '@/components/panel/DynamicForm';

const reminderSchema = {
  type: 'object' as const,
  properties: {
    text: { type: 'string' },
    due_at: { type: 'string', format: 'date-time' },
  },
  required: ['text'],
};

const commandSchema = {
  type: 'object' as const,
  properties: {
    command: { type: 'string', enum: ['git_status'] },
  },
  required: ['command'],
};

describe('DynamicForm', () => {
  it('renders a text input for a plain string field and a datetime-local input for a date-time field', () => {
    render(<DynamicForm schema={reminderSchema} onSubmit={vi.fn()} submitLabel="Ejecutar" />);

    expect(screen.getByLabelText('text')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('due_at')).toHaveAttribute('type', 'datetime-local');
  });

  it('renders a select with the schema enum options', () => {
    render(<DynamicForm schema={commandSchema} onSubmit={vi.fn()} submitLabel="Ejecutar" />);

    const select = screen.getByLabelText('command') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['git_status']);
  });

  it('calls onSubmit with the filled values, omitting empty optional fields', () => {
    const onSubmit = vi.fn();
    render(<DynamicForm schema={reminderSchema} onSubmit={onSubmit} submitLabel="Ejecutar" />);

    fireEvent.change(screen.getByLabelText('text'), { target: { value: 'llamar al contador' } });
    fireEvent.click(screen.getByText('Ejecutar'));

    expect(onSubmit).toHaveBeenCalledWith({ text: 'llamar al contador' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/components/panel/DynamicForm.test.tsx`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write the styles**

`src/components/panel/DynamicForm.module.css`:

```css
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.input,
.select {
  background: var(--background);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--foreground);
  font-size: 13px;
  outline: none;
}

.input:focus,
.select:focus {
  border-color: var(--accent);
}

.submit {
  align-self: flex-start;
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 8px 14px;
  color: var(--background);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.submit:hover {
  background: var(--accent);
}

.submit:disabled {
  opacity: 0.5;
}
```

- [ ] **Step 4: Implement the component**

`src/components/panel/DynamicForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import styles from './DynamicForm.module.css';

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; format?: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
}

export default function DynamicForm({
  schema,
  onSubmit,
  submitLabel,
  disabled,
}: {
  schema: ToolInputSchema;
  onSubmit: (values: Record<string, unknown>) => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = Object.entries(schema.properties);
  const required = new Set(schema.required ?? []);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    const result: Record<string, unknown> = {};
    for (const [key, field] of fields) {
      const raw = values[key];
      if (!raw) continue; // omit empty optional fields
      result[key] = field.type === 'array' ? raw.split(',').map((s) => s.trim()) : raw;
    }
    onSubmit(result);
  }

  return (
    <div className={styles.form}>
      {fields.map(([key, field]) => (
        <div key={key} className={styles.field}>
          <label className={styles.label} htmlFor={key}>
            {key}
            {required.has(key) ? ' *' : ''}
          </label>
          {field.enum ? (
            <select
              id={key}
              className={styles.select}
              value={values[key] ?? ''}
              onChange={(e) => setField(key, e.target.value)}
            >
              <option value="" disabled>
                Elegir…
              </option>
              {field.enum.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={key}
              className={styles.input}
              type={field.format === 'date-time' ? 'datetime-local' : 'text'}
              value={values[key] ?? ''}
              onChange={(e) => setField(key, e.target.value)}
            />
          )}
        </div>
      ))}
      <button className={styles.submit} onClick={submit} disabled={disabled}>
        {submitLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/components/panel/DynamicForm.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/panel/DynamicForm.tsx src/components/panel/DynamicForm.module.css tests/components/panel/DynamicForm.test.tsx
git commit -m "feat: add DynamicForm, generates inputs from a tool's inputSchema"
```

---

## Task 5: `ToolCard`

**Files:**
- Create: `src/components/panel/ToolCard.tsx`, `src/components/panel/ToolCard.module.css`
- Test: none — this task has no independently interesting logic (it's `DynamicForm` plus static risk-badge markup); it's covered end-to-end by `PanelClient.test.tsx` in Task 7. Building it test-first would mean re-testing `DynamicForm`'s behavior through an extra layer for no new coverage.

**Interfaces:**
- Consumes: `DynamicForm` (Task 4).
- Produces: `<ToolCard tool={{ name, description, riskLevel: 1|2|3, inputSchema }} onSubmit={(toolName, input) => void} disabled={boolean} resultMessage={string | null} errorMessage={string | null} />`.

- [ ] **Step 1: Add the risk-badge colors as new CSS custom properties**

In `src/app/globals.css`, add two new custom properties next to the existing ones in `:root`:

```css
  --risk-low: #3ddc84;
  --risk-critical: #ff5c5c;
```

(`--danger`, already defined, is reused for risk level 2's amber badge.)

- [ ] **Step 2: Write the styles**

`src/components/panel/ToolCard.module.css`:

```css
.card {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.name {
  font-size: 14px;
  font-weight: 600;
}

.badge {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
}

.badgeLow {
  color: var(--risk-low);
}

.badgeMedium {
  color: var(--danger);
}

.badgeHigh {
  color: var(--risk-critical);
}

.description {
  font-size: 12px;
  color: var(--text-dim);
}

.result {
  font-size: 12px;
  color: var(--risk-low);
  margin-top: 4px;
}

.error {
  font-size: 12px;
  color: var(--risk-critical);
  margin-top: 4px;
}
```

- [ ] **Step 3: Implement the component**

`src/components/panel/ToolCard.tsx`:

```tsx
import DynamicForm, { type ToolInputSchema } from './DynamicForm';
import styles from './ToolCard.module.css';

export interface ToolSummary {
  name: string;
  description: string;
  riskLevel: 1 | 2 | 3;
  inputSchema: ToolInputSchema;
}

const RISK_BADGE_CLASS = { 1: 'badgeLow', 2: 'badgeMedium', 3: 'badgeHigh' } as const;
const RISK_LABEL = { 1: 'Riesgo 1 · lectura', 2: 'Riesgo 2 · reversible', 3: 'Riesgo 3 · confirmación' } as const;

export default function ToolCard({
  tool,
  onSubmit,
  disabled,
  resultMessage,
  errorMessage,
}: {
  tool: ToolSummary;
  onSubmit: (toolName: string, input: Record<string, unknown>) => void;
  disabled?: boolean;
  resultMessage?: string | null;
  errorMessage?: string | null;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.name}>{tool.name}</span>
        <span className={`${styles.badge} ${styles[RISK_BADGE_CLASS[tool.riskLevel]]}`}>
          {RISK_LABEL[tool.riskLevel]}
        </span>
      </div>
      <p className={styles.description}>{tool.description}</p>
      <DynamicForm
        schema={tool.inputSchema}
        onSubmit={(values) => onSubmit(tool.name, values)}
        submitLabel="Ejecutar"
        disabled={disabled}
      />
      {resultMessage && <p className={styles.result}>{resultMessage}</p>}
      {errorMessage && <p className={styles.error}>{errorMessage}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/panel/ToolCard.tsx src/components/panel/ToolCard.module.css
git commit -m "feat: add ToolCard, presents one tool with its risk badge and form"
```

---

## Task 6: `AuditLogList`

**Files:**
- Create: `src/components/panel/AuditLogList.tsx`, `src/components/panel/AuditLogList.module.css`
- Test: `tests/components/panel/AuditLogList.test.tsx`

**Interfaces:**
- Consumes: `AuditLogRow` (Task 1, `@/lib/tools/audit`).
- Produces: `<AuditLogList rows={AuditLogRow[]} />`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/panel/AuditLogList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuditLogList from '@/components/panel/AuditLogList';

describe('AuditLogList', () => {
  it('renders one row per audit log entry with the tool name and result message', () => {
    render(
      <AuditLogList
        rows={[
          {
            id: '1',
            tool_name: 'crear_recordatorio',
            risk_level: 2,
            input: {},
            result: { success: true, message: 'Listo, agendé el recordatorio.' },
            created_at: '2026-09-03T10:00:00Z',
          },
        ]}
      />
    );

    expect(screen.getByText('crear_recordatorio')).toBeTruthy();
    expect(screen.getByText('Listo, agendé el recordatorio.')).toBeTruthy();
  });

  it('renders a placeholder when there is no history yet', () => {
    render(<AuditLogList rows={[]} />);

    expect(screen.getByText('Todavía no se ejecutó ninguna acción.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/components/panel/AuditLogList.test.tsx`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write the styles**

`src/components/panel/AuditLogList.module.css`:

```css
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  font-size: 12px;
}

.tool {
  font-weight: 600;
  flex-shrink: 0;
}

.message {
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error {
  color: var(--risk-critical);
}

.empty {
  color: var(--text-dim);
  font-size: 12px;
}
```

- [ ] **Step 4: Implement the component**

`src/components/panel/AuditLogList.tsx`:

```tsx
import type { AuditLogRow } from '@/lib/tools/audit';
import styles from './AuditLogList.module.css';

export default function AuditLogList({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return <p className={styles.empty}>Todavía no se ejecutó ninguna acción.</p>;
  }

  return (
    <div className={styles.list}>
      {rows.map((row) => (
        <div key={row.id} className={styles.row}>
          <span className={styles.tool}>{row.tool_name}</span>
          <span className={`${styles.message} ${row.result.success ? '' : styles.error}`}>
            {row.result.message}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/components/panel/AuditLogList.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/panel/AuditLogList.tsx src/components/panel/AuditLogList.module.css tests/components/panel/AuditLogList.test.tsx
git commit -m "feat: add AuditLogList, shows recent tool executions in the panel"
```

---

## Task 7: `PanelClient` — wires everything together

**Files:**
- Create: `src/components/panel/PanelClient.tsx`, `src/components/panel/PanelClient.module.css`
- Test: `tests/components/panel/PanelClient.test.tsx`

**Interfaces:**
- Consumes: `ToolCard`/`ToolSummary` (Task 5), `AuditLogList`/`AuditLogRow` (Task 6, Task 1), `ConfirmationBanner` (`@/components/chat/ConfirmationBanner`, unchanged).
- Produces: `<PanelClient tools={ToolSummary[]} initialAuditLog={AuditLogRow[]} />` — the only component in the panel that calls `fetch('/api/tools/execute')` / `fetch('/api/confirm')`.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/panel/PanelClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PanelClient from '@/components/panel/PanelClient';

const crearRecordatorioTool = {
  name: 'crear_recordatorio',
  description: 'Crea un recordatorio.',
  riskLevel: 2 as const,
  inputSchema: { type: 'object' as const, properties: { text: { type: 'string' } }, required: ['text'] },
};

const enviarMailTool = {
  name: 'enviar_mail',
  description: 'Envía un mail.',
  riskLevel: 3 as const,
  inputSchema: {
    type: 'object' as const,
    properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
    required: ['to', 'subject', 'body'],
  },
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('PanelClient', () => {
  it('executes a risk-level-2 macro directly and shows the result', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ type: 'message', text: 'Listo, agendé el recordatorio.' }),
    });

    render(<PanelClient tools={[crearRecordatorioTool]} initialAuditLog={[]} />);

    fireEvent.change(screen.getByLabelText('text'), { target: { value: 'regar las plantas' } });
    fireEvent.click(screen.getByText('Ejecutar'));

    await waitFor(() => expect(screen.getByText('Listo, agendé el recordatorio.')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tools/execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ toolName: 'crear_recordatorio', input: { text: 'regar las plantas' } }),
      })
    );
  });

  it('shows a confirmation review for a risk-level-3 macro and only executes it after confirming', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        type: 'confirmation_required',
        pendingId: 'p1',
        toolName: 'enviar_mail',
        summary: '¿Confirmás enviar el mail?',
      }),
    });

    render(<PanelClient tools={[enviarMailTool]} initialAuditLog={[]} />);

    fireEvent.change(screen.getByLabelText('to'), { target: { value: 'juan@mail.com' } });
    fireEvent.change(screen.getByLabelText('subject'), { target: { value: 'Hola' } });
    fireEvent.change(screen.getByLabelText('body'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Ejecutar'));

    await waitFor(() => expect(screen.getByText('¿Confirmás enviar el mail?')).toBeTruthy());

    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ type: 'message', text: 'Mail enviado a juan@mail.com.' }),
    });

    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(screen.getByText('Mail enviado a juan@mail.com.')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/confirm',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pendingId: 'p1', confirmed: true }) })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/components/panel/PanelClient.test.tsx`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write the styles**

`src/components/panel/PanelClient.module.css`:

```css
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px 64px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sectionTitle {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 8px;
}
```

- [ ] **Step 4: Implement the component**

`src/components/panel/PanelClient.tsx`:

```tsx
'use client';

import { useState } from 'react';
import ToolCard, { type ToolSummary } from './ToolCard';
import AuditLogList from './AuditLogList';
import ConfirmationBanner from '@/components/chat/ConfirmationBanner';
import type { AuditLogRow } from '@/lib/tools/audit';
import styles from './PanelClient.module.css';

interface PendingConfirmation {
  pendingId: string;
  toolName: string;
  summary: string;
}

export default function PanelClient({
  tools,
  initialAuditLog,
}: {
  tools: ToolSummary[];
  initialAuditLog: AuditLogRow[];
}) {
  const [results, setResults] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState(initialAuditLog);

  function applyResult(toolName: string, data: any) {
    if (data.type === 'confirmation_required') {
      setPending({ pendingId: data.pendingId, toolName: data.toolName, summary: data.summary });
      return;
    }
    setResults((prev) => ({ ...prev, [toolName]: data.text }));
    setErrors((prev) => ({ ...prev, [toolName]: '' }));
  }

  async function runTool(toolName: string, input: Record<string, unknown>) {
    setBusyTool(toolName);
    try {
      const res = await fetch('/api/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ toolName, input }),
      });
      const data = await res.json();
      applyResult(toolName, data);
    } catch {
      setErrors((prev) => ({ ...prev, [toolName]: 'No se pudo ejecutar la herramienta.' }));
    } finally {
      setBusyTool(null);
    }
  }

  async function confirm(confirmed: boolean) {
    if (!pending) return;
    const { pendingId, toolName } = pending;
    setBusyTool(toolName);
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        body: JSON.stringify({ pendingId, confirmed }),
      });
      const data = await res.json();
      setPending(null);
      applyResult(toolName, data);
    } catch {
      setErrors((prev) => ({ ...prev, [toolName]: 'No se pudo confirmar la acción.' }));
    } finally {
      setBusyTool(null);
    }
  }

  return (
    <div className={styles.page}>
      <span className={styles.title}>Panel de herramientas</span>

      <div className={styles.grid}>
        {tools.map((tool) => (
          <ToolCard
            key={tool.name}
            tool={tool}
            onSubmit={runTool}
            disabled={busyTool === tool.name}
            resultMessage={results[tool.name] || null}
            errorMessage={errors[tool.name] || null}
          />
        ))}
      </div>

      {pending && (
        <ConfirmationBanner
          summary={pending.summary}
          onConfirm={() => confirm(true)}
          onCancel={() => confirm(false)}
        />
      )}

      <div>
        <p className={styles.sectionTitle}>Historial reciente</p>
        <AuditLogList rows={auditLog} />
      </div>
    </div>
  );
}
```

(`auditLog`/`setAuditLog` is state rather than a plain prop so a later increment can refresh it after each execution without changing this component's public interface — for this task it's only ever set from `initialAuditLog`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- tests/components/panel/PanelClient.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/panel/PanelClient.tsx src/components/panel/PanelClient.module.css tests/components/panel/PanelClient.test.tsx
git commit -m "feat: add PanelClient, wires tool cards, confirmation review and audit history"
```

---

## Task 8: `/panel` page + link from the chat

**Files:**
- Create: `src/app/panel/page.tsx`
- Modify: `src/components/chat/ChatWindow.tsx`, `src/components/chat/ChatWindow.module.css`
- Test: `tests/components/chat/ChatWindow.test.tsx` (modify)

**Interfaces:**
- Consumes: `TOOLS` (`@/lib/tools/registry`), `getRecentAuditLog` (Task 1), `PanelClient` (Task 7).
- Produces: `/panel` route; a link in `ChatWindow`'s controls row.

- [ ] **Step 1: Implement the page**

`src/app/panel/page.tsx`:

```tsx
import PanelClient from '@/components/panel/PanelClient';
import { TOOLS } from '@/lib/tools/registry';
import { getRecentAuditLog } from '@/lib/tools/audit';

// Same reasoning as src/app/page.tsx: this reads live data (the audit log)
// on every request, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

export default async function PanelPage() {
  const auditLog = await getRecentAuditLog(20);
  const tools = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    riskLevel: t.riskLevel,
    inputSchema: t.inputSchema as any,
  }));

  return <PanelClient tools={tools} initialAuditLog={auditLog} />;
}
```

- [ ] **Step 2: Write the failing test for the chat's link to the panel**

In `tests/components/chat/ChatWindow.test.tsx`, add inside the existing `describe('ChatWindow', ...)` block:

```ts
  it('links to the tools control panel', () => {
    render(<ChatWindow conversationId="c1" userName="Sergi" />);

    const link = screen.getByRole('link', { name: 'Panel' });
    expect(link).toHaveAttribute('href', '/panel');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- tests/components/chat/ChatWindow.test.tsx`
Expected: FAIL (no link with accessible name "Panel")

- [ ] **Step 4: Add the `.panelLink` style**

In `src/components/chat/ChatWindow.module.css`, add:

```css
.panelLink {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-dim);
  text-decoration: none;
}

.panelLink:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 5: Add the link to `ChatWindow`**

In `src/components/chat/ChatWindow.tsx`, add the import:

```tsx
import Link from 'next/link';
```

And inside `<div className={styles.controls}>`, add the link (order doesn't matter — placed first here):

```tsx
      <div className={styles.controls}>
        <Link href="/panel" className={styles.panelLink} aria-label="Panel">
          ⚙
        </Link>
        <MuteButton muted={muted} onToggle={toggleMuted} />
        <VoiceSelector voices={voices} voiceURI={voiceURI} onChange={setVoiceURI} />
      </div>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- tests/components/chat/ChatWindow.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: PASS (every test file in the project)

- [ ] **Step 8: Run the production build**

Run: `npm run build`
Expected: succeeds, `/panel` appears in the route list

- [ ] **Step 9: Commit**

```bash
git add src/app/panel/page.tsx src/components/chat/ChatWindow.tsx src/components/chat/ChatWindow.module.css tests/components/chat/ChatWindow.test.tsx
git commit -m "feat: add /panel page and link to it from the chat controls"
```

---

## Self-Review Notes

**Spec coverage check:**
- Panel lista todas las herramientas del registry sin agregar nuevas → Task 8 (`page.tsx` reads `TOOLS` directly) ✅
- Formulario auto-generado desde `inputSchema` → Task 4 (`DynamicForm`) ✅
- Riesgo 1/2 ejecuta directo, riesgo 3 nunca ejecuta sin `/api/confirm` → Task 2 (`proposeManualAction`) + Task 3 (integration test is the critical one) ✅
- Una sola implementación del invariante de riesgo 3 (no duplicada) → Task 2 reuses `createPendingAction`/`getPendingAction`/`removePendingAction` and `handleConfirmation`, no parallel mechanism introduced ✅
- Historial reciente (`audit_log`) visible en el panel → Task 1 (`getRecentAuditLog`) + Task 6 (`AuditLogList`) ✅
- Badges de riesgo con color por nivel → Task 5 ✅
- Reusa `ConfirmationBanner` del chat, sin componente nuevo → Task 7 ✅
- Link desde el chat al panel → Task 8 ✅
- Manejo de errores (tool inexistente, `execute` falla) → `proposeManualAction`/`handleConfirmation` propagate `tool.execute`'s `{success:false, message}` through unchanged (same as the chat path already does); `getTool(name)!` non-null assertions are safe because `getRiskLevel` (called first in both paths) already throws on an unknown tool name.
- MCP fuera de alcance → no task references MCP ✅

**Type consistency check:** `ToolContext.conversationId` (Task 1) is optional everywhere it's constructed (`proposeManualAction`, `handleConfirmation`'s existing chat path, `runConversationLoop`). `PendingAction`'s new parameter order (`toolName, input, conversationId?, toolUseId?`) is used consistently in both call sites inside `index.ts` (Task 2). `ToolSummary` (Task 5) and `ToolInputSchema` (Task 4) match the shape produced by `page.tsx` (Task 8). `AuditLogRow` (Task 1) is the exact prop type `AuditLogList` (Task 6) and `PanelClient` (Task 7) consume.

**Placeholder scan:** no TBDs; every step has real, runnable code.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-03-tools-control-panel.md`.**
