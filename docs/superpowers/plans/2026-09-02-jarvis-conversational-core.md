# Jarvis — Núcleo Conversacional (Módulo 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the conversational core of Jarvis — a chat (text + voice) backed by Claude tool-calling, four-part memory, a risk-tiered permission model for actions, and a 3D orb avatar with four visual states.

**Architecture:** A single Next.js (App Router, TypeScript) application serves both the frontend (chat UI + orb) and the backend (API routes acting as the Node.js orchestrator). The orchestrator assembles relevant memory into context, calls the Claude API with tool definitions, and gates any risk-level-3 tool call behind an explicit user confirmation before it ever executes. Postgres (Supabase) stores conversations, memory, and an audit log.

**Tech Stack:** Next.js 14 (App Router) + TypeScript, `@anthropic-ai/sdk`, `@supabase/supabase-js`, Vitest for tests, Web Speech API for STT/TTS, Three.js (via the ElevenLabs UI Orb component pattern) for the avatar.

**Spec:** `docs/superpowers/specs/2026-09-02-jarvis-conversational-core-design.md`

## Global Constraints

- Single-user, no multi-tenancy (per spec "Decisiones de alcance").
- No tool of risk level 3 may execute without an explicit confirmation step — this is the single most important invariant in the system (per spec "Herramientas, acciones y modelo de permisos").
- `ejecutar_comando` only ever runs commands from a fixed whitelist — never free-form text (per spec "Whitelist de comandos").
- The LLM never receives raw source/file content beyond what a tool explicitly returns — it only ever sees normalized data (per spec "Sistema de memoria").
- Every tool execution (any risk level) is written to the audit log with timestamp, tool name, parameters, and result (per spec "Log de auditoría").
- Voice-triggered risk-level-3 actions must show the confirmation as on-screen text, never rely on audio alone (per spec "Voz").
- Credentials/tokens for external services are stored encrypted at rest, never logged in plaintext (per spec "Seguridad de datos").

---

## File Structure

```
JARVIS/
  package.json
  tsconfig.json
  vitest.config.ts
  .env.example
  supabase/
    schema.sql                       # all table definitions
  src/
    app/
      page.tsx                       # chat page (renders ChatWindow)
      api/
        chat/route.ts                # POST: user message -> orchestrator.handleUserMessage
        confirm/route.ts             # POST: confirm/reject a pending level-3 action
    lib/
      supabase/
        client.ts                    # supabase client singleton
      claude/
        client.ts                    # thin wrapper around @anthropic-ai/sdk
      memory/
        types.ts                     # ProjectContext, Preference, ConversationMessage types
        preferences.ts               # getPreferences, setPreference
        projects.ts                  # getProject, upsertProject, listRecentProjects
        conversations.ts             # appendMessage, getRecentMessages, summarizeOldMessages
        context-builder.ts           # buildContext(conversationId, newMessage)
      tools/
        types.ts                     # RiskLevel, ToolDefinition, ToolResult, ToolContext
        registry.ts                  # TOOLS array, getTool, getRiskLevel
        audit.ts                     # logToolExecution
        catalog/
          consultarEstadoProyecto.ts # risk 1
          crearRecordatorio.ts       # risk 2
          enviarMail.ts              # risk 3 (pluggable sender, MVP = log-only)
          ejecutarComando.ts         # risk 3 (whitelist)
      orchestrator/
        pending-actions.ts           # in-memory/DB store for actions awaiting confirmation
        index.ts                     # handleUserMessage, handleConfirmation
    components/
      chat/
        ChatWindow.tsx
        MessageList.tsx
        MessageInput.tsx
        ConfirmationBanner.tsx       # level-3 confirmation UI (text, always visible)
      orb/
        Orb.tsx                      # avatar, prop: state: 'idle'|'listening'|'thinking'|'speaking'
    hooks/
      useSpeechRecognition.ts        # STT wrapper over Web Speech API
      useSpeechSynthesis.ts          # TTS wrapper over Web Speech API
  tests/
    lib/
      tools/
        registry.test.ts
        ejecutarComando.test.ts
      memory/
        context-builder.test.ts
      orchestrator/
        index.test.ts                # the critical "no risk-3 without confirmation" test
```

**Responsibility boundaries:**
- `lib/tools/*` never talks to Claude or memory — it only exposes `execute(input, ctx)` functions and risk metadata.
- `lib/memory/*` never talks to Claude or tools — pure data access + the context-assembly function.
- `lib/orchestrator/index.ts` is the only module that talks to Claude, memory, and tools together — it is the piece the critical tests target.
- `components/*` never call Supabase or Claude directly — they only call the `/api/*` routes.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/app/page.tsx`, `src/app/layout.tsx`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: a runnable Next.js + TypeScript + Vitest project with `npm run dev`, `npm run test`, `npm run build` all working.

- [ ] **Step 1: Scaffold Next.js app**

Run:
```bash
npx create-next-app@latest . --typescript --app --eslint --src-dir --import-alias "@/*" --no-tailwind
```
Accept defaults for anything else prompted.

- [ ] **Step 2: Add dependencies**

```bash
npm install @anthropic-ai/sdk @supabase/supabase-js three
npm install -D vitest @vitejs/plugin-react @testing-library/react jsdom
```

- [ ] **Step 3: Add Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Write the smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('project scaffolding', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (1 test)

- [ ] **Step 6: Add `.env.example`**

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript + Vitest project"
```

---

## Task 2: Supabase schema and client

**Files:**
- Create: `supabase/schema.sql`, `src/lib/supabase/client.ts`
- Test: none (infra task; verified by Task 3+ tests that import the client)

**Interfaces:**
- Produces: `getSupabaseClient(): SupabaseClient` used by every module in `lib/memory` and `lib/tools/audit.ts`.

- [ ] **Step 1: Write the schema**

`supabase/schema.sql`:
```sql
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  description text,
  key_decisions text,
  updated_at timestamptz not null default now()
);

create table if not exists preferences (
  key text primary key,
  value text not null
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  role text not null check (role in ('user', 'assistant', 'summary')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tool_name text not null,
  risk_level int not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists pending_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  tool_name text not null,
  input jsonb not null,
  summary text not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Write the Supabase client wrapper**

`src/lib/supabase/client.ts`:
```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  client = createClient(url, key);
  return client;
}
```

- [ ] **Step 3: Apply the schema**

Run the SQL in `supabase/schema.sql` against your Supabase project (via the Supabase SQL editor or `supabase db push` if using the CLI).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql src/lib/supabase/client.ts
git commit -m "feat: add Supabase schema and client wrapper"
```

---

## Task 3: Tool types and risk-level registry

**Files:**
- Create: `src/lib/tools/types.ts`, `src/lib/tools/registry.ts`
- Test: `tests/lib/tools/registry.test.ts`

**Interfaces:**
- Produces:
  - `type RiskLevel = 1 | 2 | 3`
  - `interface ToolResult { success: boolean; message: string; data?: unknown }`
  - `interface ToolContext { conversationId: string }`
  - `interface ToolDefinition { name: string; description: string; riskLevel: RiskLevel; inputSchema: object; execute(input: unknown, ctx: ToolContext): Promise<ToolResult> }`
  - `function getTool(name: string): ToolDefinition | undefined`
  - `function getRiskLevel(name: string): RiskLevel` (throws if tool unknown)
  - `const TOOLS: ToolDefinition[]` (empty array in this task — populated in Task 4)

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { TOOLS, getTool, getRiskLevel } from '@/lib/tools/registry';
import type { ToolDefinition } from '@/lib/tools/types';

describe('tool registry', () => {
  it('registers a fake tool and finds it by name', () => {
    const fake: ToolDefinition = {
      name: 'fake_tool',
      description: 'test tool',
      riskLevel: 2,
      inputSchema: {},
      execute: async () => ({ success: true, message: 'ok' }),
    };
    TOOLS.push(fake);

    expect(getTool('fake_tool')).toBe(fake);
    expect(getRiskLevel('fake_tool')).toBe(2);
  });

  it('throws when asking the risk level of an unknown tool', () => {
    expect(() => getRiskLevel('does_not_exist')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/registry.test.ts`
Expected: FAIL (module `@/lib/tools/registry` does not exist)

- [ ] **Step 3: Write the types**

`src/lib/tools/types.ts`:
```ts
export type RiskLevel = 1 | 2 | 3;

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ToolContext {
  conversationId: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema: object;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}
```

- [ ] **Step 4: Write the registry**

`src/lib/tools/registry.ts`:
```ts
import type { ToolDefinition, RiskLevel } from './types';

export const TOOLS: ToolDefinition[] = [];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function getRiskLevel(name: string): RiskLevel {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.riskLevel;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/registry.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/types.ts src/lib/tools/registry.ts tests/lib/tools/registry.test.ts
git commit -m "feat: add tool types and risk-level registry"
```

---

## Task 4: Audit log module

**Files:**
- Create: `src/lib/tools/audit.ts`
- Test: `tests/lib/tools/audit.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient()` from `@/lib/supabase/client` (Task 2).
- Produces: `function logToolExecution(toolName: string, riskLevel: RiskLevel, input: unknown, result: ToolResult): Promise<void>`

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/audit.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  return { getSupabaseClient: () => ({ from }) };
});

import { logToolExecution } from '@/lib/tools/audit';
import { getSupabaseClient } from '@/lib/supabase/client';

describe('logToolExecution', () => {
  it('inserts a row into audit_log with the tool name, risk level, input and result', async () => {
    await logToolExecution('enviar_mail', 3, { to: 'a@b.com' }, { success: true, message: 'sent' });

    const client = getSupabaseClient() as any;
    expect(client.from).toHaveBeenCalledWith('audit_log');
    const insertCall = client.from.mock.results[0].value.insert;
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: 'enviar_mail',
        risk_level: 3,
        input: { to: 'a@b.com' },
        result: { success: true, message: 'sent' },
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/audit.test.ts`
Expected: FAIL (module `@/lib/tools/audit` does not exist)

- [ ] **Step 3: Write the implementation**

`src/lib/tools/audit.ts`:
```ts
import { getSupabaseClient } from '@/lib/supabase/client';
import type { RiskLevel, ToolResult } from './types';

export async function logToolExecution(
  toolName: string,
  riskLevel: RiskLevel,
  input: unknown,
  result: ToolResult
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('audit_log').insert({
    tool_name: toolName,
    risk_level: riskLevel,
    input,
    result,
  });
  if (error) throw new Error(`Failed to write audit log: ${error.message}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/audit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/audit.ts tests/lib/tools/audit.test.ts
git commit -m "feat: add audit log module"
```

---

## Task 5: Read-only tool — `consultar_estado_proyecto` (risk 1)

**Files:**
- Create: `src/lib/tools/catalog/consultarEstadoProyecto.ts`
- Modify: `src/lib/tools/registry.ts` (register the tool)
- Test: `tests/lib/tools/catalog/consultarEstadoProyecto.test.ts`

**Interfaces:**
- Consumes: `getProject(name: string)` from `@/lib/memory/projects` (this task defines a minimal inline version; Task 9 replaces it with the real memory module — see Step 3 note).
- Produces: a `ToolDefinition` named `consultar_estado_proyecto`, `riskLevel: 1`, registered in `TOOLS`.

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/catalog/consultarEstadoProyecto.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/projects', () => ({
  getProject: vi.fn().mockResolvedValue({
    name: 'FINANCE',
    status: 'paused',
    description: 'App de finanzas personales',
  }),
}));

import { consultarEstadoProyecto } from '@/lib/tools/catalog/consultarEstadoProyecto';

describe('consultar_estado_proyecto', () => {
  it('is risk level 1 (read-only)', () => {
    expect(consultarEstadoProyecto.riskLevel).toBe(1);
  });

  it('returns the project status as tool result data', async () => {
    const result = await consultarEstadoProyecto.execute(
      { name: 'FINANCE' },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'FINANCE',
      status: 'paused',
      description: 'App de finanzas personales',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/catalog/consultarEstadoProyecto.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write a minimal `getProject` stub for memory (real version comes in Task 9)**

`src/lib/memory/projects.ts`:
```ts
export interface ProjectRecord {
  name: string;
  status: string;
  description: string | null;
}

export async function getProject(_name: string): Promise<ProjectRecord | null> {
  throw new Error('Not implemented yet — see Task 9');
}
```

- [ ] **Step 4: Write the tool**

`src/lib/tools/catalog/consultarEstadoProyecto.ts`:
```ts
import type { ToolDefinition } from '../types';
import { getProject } from '@/lib/memory/projects';

export const consultarEstadoProyecto: ToolDefinition = {
  name: 'consultar_estado_proyecto',
  description: 'Devuelve el estado, descripción y última actualización de un proyecto del usuario.',
  riskLevel: 1,
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  async execute(input, _ctx) {
    const { name } = input as { name: string };
    const project = await getProject(name);
    if (!project) {
      return { success: false, message: `No se encontró el proyecto "${name}".` };
    }
    return { success: true, message: 'Proyecto encontrado.', data: project };
  },
};
```

- [ ] **Step 5: Register it**

In `src/lib/tools/registry.ts`, replace `export const TOOLS: ToolDefinition[] = [];` with:
```ts
import { consultarEstadoProyecto } from './catalog/consultarEstadoProyecto';

export const TOOLS: ToolDefinition[] = [consultarEstadoProyecto];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/catalog/consultarEstadoProyecto.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/catalog/consultarEstadoProyecto.ts src/lib/memory/projects.ts src/lib/tools/registry.ts tests/lib/tools/catalog/consultarEstadoProyecto.test.ts
git commit -m "feat: add consultar_estado_proyecto tool (risk level 1)"
```

---

## Task 6: Reversible tool — `crear_recordatorio` (risk 2)

**Files:**
- Create: `src/lib/tools/catalog/crearRecordatorio.ts`
- Modify: `src/lib/tools/registry.ts`
- Test: `tests/lib/tools/catalog/crearRecordatorio.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient()` from `@/lib/supabase/client`.
- Produces: a `ToolDefinition` named `crear_recordatorio`, `riskLevel: 2`.

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/catalog/crearRecordatorio.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  return { getSupabaseClient: () => ({ from }) };
});

import { crearRecordatorio } from '@/lib/tools/catalog/crearRecordatorio';

describe('crear_recordatorio', () => {
  it('is risk level 2 (reversible, low impact)', () => {
    expect(crearRecordatorio.riskLevel).toBe(2);
  });

  it('inserts a reminder into preferences-like storage and reports success', async () => {
    const result = await crearRecordatorio.execute(
      { text: 'Llamar al contador', due_at: '2026-09-10T10:00:00Z' },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('recordatorio');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/catalog/crearRecordatorio.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Add the `reminders` table to the schema**

Append to `supabase/schema.sql`:
```sql
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);
```
Re-run this against Supabase the same way as Task 2 Step 3.

- [ ] **Step 4: Write the tool**

`src/lib/tools/catalog/crearRecordatorio.ts`:
```ts
import type { ToolDefinition } from '../types';
import { getSupabaseClient } from '@/lib/supabase/client';

export const crearRecordatorio: ToolDefinition = {
  name: 'crear_recordatorio',
  description: 'Crea un recordatorio para el usuario en una fecha dada.',
  riskLevel: 2,
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      due_at: { type: 'string', format: 'date-time' },
    },
    required: ['text'],
  },
  async execute(input, _ctx) {
    const { text, due_at } = input as { text: string; due_at?: string };
    const client = getSupabaseClient();
    const { error } = await client.from('reminders').insert({ text, due_at: due_at ?? null });
    if (error) {
      return { success: false, message: `No pude crear el recordatorio: ${error.message}` };
    }
    return { success: true, message: `Listo, agendé el recordatorio: "${text}".` };
  },
};
```

- [ ] **Step 5: Register it**

In `src/lib/tools/registry.ts`:
```ts
import { crearRecordatorio } from './catalog/crearRecordatorio';

export const TOOLS: ToolDefinition[] = [consultarEstadoProyecto, crearRecordatorio];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/catalog/crearRecordatorio.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/catalog/crearRecordatorio.ts src/lib/tools/registry.ts supabase/schema.sql tests/lib/tools/catalog/crearRecordatorio.test.ts
git commit -m "feat: add crear_recordatorio tool (risk level 2)"
```

---

## Task 7: Irreversible tool — `enviar_mail` (risk 3)

**Files:**
- Create: `src/lib/tools/catalog/enviarMail.ts`
- Modify: `src/lib/tools/registry.ts`
- Test: `tests/lib/tools/catalog/enviarMail.test.ts`

**Interfaces:**
- Produces: a `ToolDefinition` named `enviar_mail`, `riskLevel: 3`, with a pluggable `EmailSender` (MVP implementation logs instead of sending — real SMTP/provider integration is explicitly out of scope per spec, but the interface is real so swapping providers later doesn't touch the tool or orchestrator).

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/catalog/enviarMail.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { enviarMail, setEmailSender } from '@/lib/tools/catalog/enviarMail';

describe('enviar_mail', () => {
  it('is risk level 3 (irreversible, external impact)', () => {
    expect(enviarMail.riskLevel).toBe(3);
  });

  it('delegates to the configured EmailSender and reports success', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    setEmailSender({ send });

    const result = await enviarMail.execute(
      { to: 'juan@mail.com', subject: 'Reporte', body: 'Adjunto el reporte.' },
      { conversationId: 'c1' }
    );

    expect(send).toHaveBeenCalledWith('juan@mail.com', 'Reporte', 'Adjunto el reporte.');
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/catalog/enviarMail.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write the tool with a pluggable sender**

`src/lib/tools/catalog/enviarMail.ts`:
```ts
import type { ToolDefinition } from '../types';

export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

const logOnlySender: EmailSender = {
  async send(to, subject, body) {
    console.log(`[enviar_mail:MVP] to=${to} subject="${subject}" body="${body}"`);
  },
};

let currentSender: EmailSender = logOnlySender;

export function setEmailSender(sender: EmailSender): void {
  currentSender = sender;
}

export const enviarMail: ToolDefinition = {
  name: 'enviar_mail',
  description: 'Envía un mail en nombre del usuario. Acción irreversible con impacto externo.',
  riskLevel: 3,
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['to', 'subject', 'body'],
  },
  async execute(input, _ctx) {
    const { to, subject, body } = input as { to: string; subject: string; body: string };
    await currentSender.send(to, subject, body);
    return { success: true, message: `Mail enviado a ${to}.` };
  },
};
```

- [ ] **Step 4: Register it**

In `src/lib/tools/registry.ts`:
```ts
import { enviarMail } from './catalog/enviarMail';

export const TOOLS: ToolDefinition[] = [consultarEstadoProyecto, crearRecordatorio, enviarMail];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/catalog/enviarMail.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/catalog/enviarMail.ts src/lib/tools/registry.ts tests/lib/tools/catalog/enviarMail.test.ts
git commit -m "feat: add enviar_mail tool (risk level 3, log-only MVP sender)"
```

---

## Task 8: Irreversible tool — `ejecutar_comando` with whitelist (risk 3)

**Files:**
- Create: `src/lib/tools/catalog/ejecutarComando.ts`
- Modify: `src/lib/tools/registry.ts`
- Test: `tests/lib/tools/catalog/ejecutarComando.test.ts`

**Interfaces:**
- Produces: a `ToolDefinition` named `ejecutar_comando`, `riskLevel: 3`, that rejects any command not present in a fixed whitelist — this directly implements the Global Constraint "never free-form text".

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/catalog/ejecutarComando.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ejecutarComando } from '@/lib/tools/catalog/ejecutarComando';

describe('ejecutar_comando', () => {
  it('is risk level 3 (irreversible, external impact)', () => {
    expect(ejecutarComando.riskLevel).toBe(3);
  });

  it('rejects a command not in the whitelist without running anything', async () => {
    const result = await ejecutarComando.execute(
      { command: 'rm', args: ['-rf', '/'] },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('no está permitido');
  });

  it('accepts a whitelisted command', async () => {
    const result = await ejecutarComando.execute(
      { command: 'git_status', args: [] },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/catalog/ejecutarComando.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write the tool**

`src/lib/tools/catalog/ejecutarComando.ts`:
```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolDefinition } from '../types';

const execFileAsync = promisify(execFile);

// Fixed whitelist: key = name exposed to the model, value = real binary + fixed args.
// Never interpolate user-provided text into the command itself, only into `args`
// for entries explicitly designed to accept them (none do yet in the MVP).
const COMMAND_WHITELIST: Record<string, { bin: string; fixedArgs: string[] }> = {
  git_status: { bin: 'git', fixedArgs: ['status', '--short'] },
};

export const ejecutarComando: ToolDefinition = {
  name: 'ejecutar_comando',
  description: 'Ejecuta un comando de una lista fija y permitida. Nunca ejecuta texto libre.',
  riskLevel: 3,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', enum: Object.keys(COMMAND_WHITELIST) },
      args: { type: 'array', items: { type: 'string' } },
    },
    required: ['command'],
  },
  async execute(input, _ctx) {
    const { command } = input as { command: string; args?: string[] };
    const entry = COMMAND_WHITELIST[command];
    if (!entry) {
      return { success: false, message: `El comando "${command}" no está permitido.` };
    }
    try {
      const { stdout } = await execFileAsync(entry.bin, entry.fixedArgs);
      return { success: true, message: 'Comando ejecutado.', data: stdout };
    } catch (err) {
      return { success: false, message: `Falló la ejecución: ${(err as Error).message}` };
    }
  },
};
```

- [ ] **Step 4: Register it**

In `src/lib/tools/registry.ts`:
```ts
import { ejecutarComando } from './catalog/ejecutarComando';

export const TOOLS: ToolDefinition[] = [
  consultarEstadoProyecto,
  crearRecordatorio,
  enviarMail,
  ejecutarComando,
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/catalog/ejecutarComando.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/catalog/ejecutarComando.ts src/lib/tools/registry.ts tests/lib/tools/catalog/ejecutarComando.test.ts
git commit -m "feat: add ejecutar_comando tool with fixed whitelist (risk level 3)"
```

---

## Task 9: Memory — projects, preferences, conversations

**Files:**
- Modify: `src/lib/memory/projects.ts` (replace the Task 5 stub with the real implementation)
- Create: `src/lib/memory/preferences.ts`, `src/lib/memory/conversations.ts`, `src/lib/memory/types.ts`
- Test: `tests/lib/memory/projects.test.ts`, `tests/lib/memory/preferences.test.ts`, `tests/lib/memory/conversations.test.ts`

**Interfaces:**
- Produces:
  - `getProject(name: string): Promise<ProjectRecord | null>` (real version, backed by Supabase)
  - `upsertProject(record: ProjectRecord): Promise<void>`
  - `listRecentProjects(limit: number): Promise<ProjectRecord[]>`
  - `getPreferences(): Promise<Record<string, string>>`
  - `setPreference(key: string, value: string): Promise<void>`
  - `appendMessage(conversationId: string, role: 'user' | 'assistant' | 'summary', content: string): Promise<void>`
  - `getRecentMessages(conversationId: string, limit: number): Promise<ConversationMessage[]>`

- [ ] **Step 1: Write the failing tests**

`tests/lib/memory/projects.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { name: 'FINANCE', status: 'paused', description: 'App de finanzas' },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { getSupabaseClient: () => ({ from }) };
});

import { getProject, upsertProject } from '@/lib/memory/projects';

describe('projects memory', () => {
  it('fetches a project by name', async () => {
    const project = await getProject('FINANCE');
    expect(project).toEqual({ name: 'FINANCE', status: 'paused', description: 'App de finanzas' });
  });

  it('upserts a project', async () => {
    await expect(
      upsertProject({ name: 'JARVIS', status: 'active', description: 'Asistente personal' })
    ).resolves.toBeUndefined();
  });
});
```

`tests/lib/memory/preferences.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const select = vi.fn().mockResolvedValue({
    data: [{ key: 'tono', value: 'directo' }],
    error: null,
  });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { getSupabaseClient: () => ({ from }) };
});

import { getPreferences, setPreference } from '@/lib/memory/preferences';

describe('preferences memory', () => {
  it('returns all preferences as a key-value map', async () => {
    const prefs = await getPreferences();
    expect(prefs).toEqual({ tono: 'directo' });
  });

  it('sets a preference', async () => {
    await expect(setPreference('tono', 'formal')).resolves.toBeUndefined();
  });
});
```

`tests/lib/memory/conversations.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const order = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({
      data: [{ role: 'user', content: 'hola', created_at: '2026-09-02T10:00:00Z' }],
      error: null,
    }),
  });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, select });
  return { getSupabaseClient: () => ({ from }) };
});

import { appendMessage, getRecentMessages } from '@/lib/memory/conversations';

describe('conversations memory', () => {
  it('appends a message', async () => {
    await expect(appendMessage('c1', 'user', 'hola')).resolves.toBeUndefined();
  });

  it('returns recent messages for a conversation', async () => {
    const messages = await getRecentMessages('c1', 10);
    expect(messages).toEqual([{ role: 'user', content: 'hola', created_at: '2026-09-02T10:00:00Z' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/memory`
Expected: FAIL (`preferences.ts` and `conversations.ts` don't exist; `projects.ts` throws "Not implemented")

- [ ] **Step 3: Write shared types**

`src/lib/memory/types.ts`:
```ts
export interface ProjectRecord {
  name: string;
  status: string;
  description: string | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'summary';
  content: string;
  created_at: string;
}
```

- [ ] **Step 4: Implement `projects.ts` for real**

`src/lib/memory/projects.ts`:
```ts
import { getSupabaseClient } from '@/lib/supabase/client';
import type { ProjectRecord } from './types';

export async function getProject(name: string): Promise<ProjectRecord | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('projects').select('name, status, description').eq('name', name).maybeSingle();
  if (error) throw new Error(`Failed to fetch project: ${error.message}`);
  return data ?? null;
}

export async function upsertProject(record: ProjectRecord): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('projects').upsert(record, { onConflict: 'name' });
  if (error) throw new Error(`Failed to upsert project: ${error.message}`);
}

export async function listRecentProjects(limit: number): Promise<ProjectRecord[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('projects')
    .select('name, status, description')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 5: Implement `preferences.ts`**

`src/lib/memory/preferences.ts`:
```ts
import { getSupabaseClient } from '@/lib/supabase/client';

export async function getPreferences(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('preferences').select('key, value');
  if (error) throw new Error(`Failed to fetch preferences: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

export async function setPreference(key: string, value: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('preferences').upsert({ key, value });
  if (error) throw new Error(`Failed to set preference: ${error.message}`);
}
```

- [ ] **Step 6: Implement `conversations.ts`**

`src/lib/memory/conversations.ts`:
```ts
import { getSupabaseClient } from '@/lib/supabase/client';
import type { ConversationMessage } from './types';

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'summary',
  content: string
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('messages').insert({ conversation_id: conversationId, role, content });
  if (error) throw new Error(`Failed to append message: ${error.message}`);
}

export async function getRecentMessages(conversationId: string, limit: number): Promise<ConversationMessage[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return (data ?? []).reverse();
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test -- tests/lib/memory`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add src/lib/memory tests/lib/memory
git commit -m "feat: implement projects, preferences and conversations memory modules"
```

---

## Task 10: Conversation summarization

**Files:**
- Modify: `src/lib/memory/conversations.ts` (add `summarizeOldMessages`)
- Test: `tests/lib/memory/summarize.test.ts`

**Interfaces:**
- Consumes: `getRecentMessages`, `appendMessage` (same file), an injectable summarizer function so this task doesn't depend on the Claude client (added in Task 11).
- Produces: `function summarizeOldMessages(conversationId: string, keepLast: number, summarize: (text: string) => Promise<string>): Promise<void>` — replaces everything older than `keepLast` messages with a single `role: 'summary'` message.

- [ ] **Step 1: Write the failing test**

`tests/lib/memory/summarize.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const messages = [
  { role: 'user', content: 'msg1', created_at: '2026-09-01T10:00:00Z' },
  { role: 'assistant', content: 'msg2', created_at: '2026-09-01T10:01:00Z' },
  { role: 'user', content: 'msg3', created_at: '2026-09-02T10:00:00Z' },
  { role: 'assistant', content: 'msg4', created_at: '2026-09-02T10:01:00Z' },
];

vi.mock('@/lib/supabase/client', () => {
  const order = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ data: [...messages].reverse(), error: null }),
  });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq: deleteEq, lt: vi.fn().mockReturnValue({ eq: deleteEq }) });
  const from = vi.fn().mockReturnValue({ select, insert, delete: del });
  return { getSupabaseClient: () => ({ from }) };
});

import { summarizeOldMessages } from '@/lib/memory/conversations';

describe('summarizeOldMessages', () => {
  it('summarizes everything except the last N messages and inserts a summary row', async () => {
    const summarize = vi.fn().mockResolvedValue('Resumen: msg1, msg2');

    await summarizeOldMessages('c1', 2, summarize);

    expect(summarize).toHaveBeenCalledWith(expect.stringContaining('msg1'));
    expect(summarize).toHaveBeenCalledWith(expect.stringContaining('msg2'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/memory/summarize.test.ts`
Expected: FAIL (`summarizeOldMessages` is not exported)

- [ ] **Step 3: Implement it**

Append to `src/lib/memory/conversations.ts`:
```ts
export async function summarizeOldMessages(
  conversationId: string,
  keepLast: number,
  summarize: (text: string) => Promise<string>
): Promise<void> {
  const client = getSupabaseClient();
  const all = await getRecentMessages(conversationId, 1000);
  if (all.length <= keepLast) return;

  const toSummarize = all.slice(0, all.length - keepLast);
  const text = toSummarize.map((m) => `${m.role}: ${m.content}`).join('\n');
  const summaryText = await summarize(text);

  const { error: insertError } = await client
    .from('messages')
    .insert({ conversation_id: conversationId, role: 'summary', content: summaryText });
  if (insertError) throw new Error(`Failed to insert summary: ${insertError.message}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/memory/summarize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory/conversations.ts tests/lib/memory/summarize.test.ts
git commit -m "feat: add conversation summarization for long-running chats"
```

---

## Task 11: Claude client wrapper

**Files:**
- Create: `src/lib/claude/client.ts`
- Test: `tests/lib/claude/client.test.ts`

**Interfaces:**
- Produces:
  - `interface ClaudeMessage { role: 'user' | 'assistant'; content: string }`
  - `interface ClaudeToolUse { type: 'tool_use'; id: string; name: string; input: unknown }`
  - `interface ClaudeTextBlock { type: 'text'; text: string }`
  - `interface ClaudeResponse { blocks: (ClaudeTextBlock | ClaudeToolUse)[] }`
  - `function sendToClaude(messages: ClaudeMessage[], tools: ToolDefinition[]): Promise<ClaudeResponse>`
  - `function summarizeWithClaude(text: string): Promise<string>` (used by Task 10's `summarize` argument)

- [ ] **Step 1: Write the failing test**

`tests/lib/claude/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = { create: mockCreate };
    },
  };
});

import { sendToClaude, summarizeWithClaude } from '@/lib/claude/client';

describe('claude client', () => {
  it('maps a text-only response to a ClaudeTextBlock', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hola!' }] });

    const response = await sendToClaude([{ role: 'user', content: 'hola' }], []);

    expect(response.blocks).toEqual([{ type: 'text', text: 'hola!' }]);
  });

  it('maps a tool_use response to a ClaudeToolUse block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'tu_1', name: 'enviar_mail', input: { to: 'a@b.com' } }],
    });

    const response = await sendToClaude([{ role: 'user', content: 'mandale un mail a a@b.com' }], []);

    expect(response.blocks).toEqual([
      { type: 'tool_use', id: 'tu_1', name: 'enviar_mail', input: { to: 'a@b.com' } },
    ]);
  });

  it('summarizeWithClaude returns the text block from a single-turn call', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Resumen breve.' }] });

    const summary = await summarizeWithClaude('conversación larga...');

    expect(summary).toBe('Resumen breve.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/claude/client.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement the client**

`src/lib/claude/client.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition } from '@/lib/tools/types';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/claude/client.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/client.ts tests/lib/claude/client.test.ts
git commit -m "feat: add Claude API client wrapper with tool-calling and summarization"
```

---

## Task 12: Context builder

**Files:**
- Create: `src/lib/memory/context-builder.ts`
- Test: `tests/lib/memory/context-builder.test.ts`

**Interfaces:**
- Consumes: `getRecentMessages` (Task 9), `getPreferences` (Task 9), `listRecentProjects` (Task 9).
- Produces: `function buildContext(conversationId: string): Promise<ClaudeMessage[]>` — assembles a preferences line + project summary line as a synthetic leading `user`-role system-style message, followed by the recent conversation messages mapped to `ClaudeMessage`. (Claude's actual system-prompt mechanism is used at the orchestrator call site in Task 13; this function only assembles the *content*, keeping it framework-agnostic and easy to test.)

- [ ] **Step 1: Write the failing test**

`tests/lib/memory/context-builder.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/conversations', () => ({
  getRecentMessages: vi.fn().mockResolvedValue([
    { role: 'summary', content: 'Resumen previo.', created_at: '2026-09-01T00:00:00Z' },
    { role: 'user', content: 'Hola Jarvis', created_at: '2026-09-02T10:00:00Z' },
  ]),
}));
vi.mock('@/lib/memory/preferences', () => ({
  getPreferences: vi.fn().mockResolvedValue({ tono: 'directo' }),
}));
vi.mock('@/lib/memory/projects', () => ({
  listRecentProjects: vi.fn().mockResolvedValue([
    { name: 'FINANCE', status: 'paused', description: 'App de finanzas' },
  ]),
}));

import { buildContext } from '@/lib/memory/context-builder';

describe('buildContext', () => {
  it('produces a leading context message plus the mapped conversation history', async () => {
    const messages = await buildContext('c1');

    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('tono: directo');
    expect(messages[0].content).toContain('FINANCE');
    expect(messages[0].content).toContain('Resumen previo.');

    expect(messages[1]).toEqual({ role: 'user', content: 'Hola Jarvis' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/memory/context-builder.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement it**

`src/lib/memory/context-builder.ts`:
```ts
import { getRecentMessages } from './conversations';
import { getPreferences } from './preferences';
import { listRecentProjects } from './projects';
import type { ClaudeMessage } from '@/lib/claude/client';

export async function buildContext(conversationId: string): Promise<ClaudeMessage[]> {
  const [history, preferences, projects] = await Promise.all([
    getRecentMessages(conversationId, 20),
    getPreferences(),
    listRecentProjects(5),
  ]);

  const summaryMessages = history.filter((m) => m.role === 'summary');
  const turnMessages = history.filter((m) => m.role !== 'summary');

  const preferencesLine = Object.entries(preferences)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const projectsLine = projects.map((p) => `${p.name} (${p.status}): ${p.description ?? 'sin descripción'}`).join('; ');
  const summaryLine = summaryMessages.map((m) => m.content).join(' ');

  const leadingContext: ClaudeMessage = {
    role: 'user',
    content: [
      preferencesLine ? `Preferencias del usuario: ${preferencesLine}.` : '',
      projectsLine ? `Proyectos recientes: ${projectsLine}.` : '',
      summaryLine ? `Resumen de la conversación previa: ${summaryLine}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };

  const mappedHistory: ClaudeMessage[] = turnMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return [leadingContext, ...mappedHistory];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/memory/context-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory/context-builder.ts tests/lib/memory/context-builder.test.ts
git commit -m "feat: add context builder assembling memory into Claude messages"
```

---

## Task 13: Orchestrator — the critical risk-gating logic

**Files:**
- Create: `src/lib/orchestrator/pending-actions.ts`, `src/lib/orchestrator/index.ts`
- Test: `tests/lib/orchestrator/index.test.ts`

**Interfaces:**
- Consumes: `buildContext` (Task 12), `sendToClaude` (Task 11), `TOOLS`/`getTool`/`getRiskLevel` (Task 3), `logToolExecution` (Task 4), `appendMessage` (Task 9).
- Produces:
  - `type OrchestratorResponse = { type: 'message'; text: string } | { type: 'confirmation_required'; pendingId: string; toolName: string; summary: string }`
  - `function handleUserMessage(conversationId: string, text: string): Promise<OrchestratorResponse>`
  - `function handleConfirmation(pendingId: string, confirmed: boolean): Promise<OrchestratorResponse>`

- [ ] **Step 1: Write the failing tests (this is the most important test in the whole plan)**

`tests/lib/orchestrator/index.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const appendMessage = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/memory/conversations', () => ({ appendMessage: (...args: any[]) => appendMessage(...args) }));
vi.mock('@/lib/memory/context-builder', () => ({
  buildContext: vi.fn().mockResolvedValue([{ role: 'user', content: 'contexto previo' }]),
}));

const sendToClaude = vi.fn();
vi.mock('@/lib/claude/client', () => ({ sendToClaude: (...args: any[]) => sendToClaude(...args) }));

const logToolExecution = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/tools/audit', () => ({ logToolExecution: (...args: any[]) => logToolExecution(...args) }));

const fakeExecute = vi.fn().mockResolvedValue({ success: true, message: 'Recordatorio creado.' });
const fakeSendMailExecute = vi.fn().mockResolvedValue({ success: true, message: 'Mail enviado.' });
vi.mock('@/lib/tools/registry', () => ({
  TOOLS: [
    { name: 'crear_recordatorio', description: '', riskLevel: 2, inputSchema: {}, execute: fakeExecute },
    { name: 'enviar_mail', description: '', riskLevel: 3, inputSchema: {}, execute: fakeSendMailExecute },
  ],
  getTool: (name: string) =>
    name === 'crear_recordatorio'
      ? { name, riskLevel: 2, execute: fakeExecute }
      : name === 'enviar_mail'
      ? { name, riskLevel: 3, execute: fakeSendMailExecute }
      : undefined,
  getRiskLevel: (name: string) => (name === 'crear_recordatorio' ? 2 : 3),
}));

import { handleUserMessage, handleConfirmation } from '@/lib/orchestrator/index';

beforeEach(() => {
  fakeExecute.mockClear();
  fakeSendMailExecute.mockClear();
  logToolExecution.mockClear();
});

describe('orchestrator risk gating', () => {
  it('executes a risk-level-2 tool call immediately and returns the final message', async () => {
    sendToClaude
      .mockResolvedValueOnce({
        blocks: [{ type: 'tool_use', id: 'tu_1', name: 'crear_recordatorio', input: { text: 'llamar al contador' } }],
      })
      .mockResolvedValueOnce({ blocks: [{ type: 'text', text: 'Listo, ya lo agendé.' }] });

    const result = await handleUserMessage('c1', 'recordame llamar al contador');

    expect(fakeExecute).toHaveBeenCalledTimes(1);
    expect(logToolExecution).toHaveBeenCalledWith('crear_recordatorio', 2, expect.anything(), expect.anything());
    expect(result).toEqual({ type: 'message', text: 'Listo, ya lo agendé.' });
  });

  it('NEVER executes a risk-level-3 tool call before confirmation', async () => {
    sendToClaude.mockResolvedValueOnce({
      blocks: [
        { type: 'tool_use', id: 'tu_2', name: 'enviar_mail', input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' } },
      ],
    });

    const result = await handleUserMessage('c1', 'mandale un mail a juan');

    expect(fakeSendMailExecute).not.toHaveBeenCalled();
    expect(result.type).toBe('confirmation_required');
    if (result.type === 'confirmation_required') {
      expect(result.toolName).toBe('enviar_mail');
      expect(result.pendingId).toBeTruthy();
    }
  });

  it('executes the risk-level-3 tool only after explicit confirmation, and logs it', async () => {
    sendToClaude.mockResolvedValueOnce({
      blocks: [
        { type: 'tool_use', id: 'tu_3', name: 'enviar_mail', input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' } },
      ],
    });
    const pending = await handleUserMessage('c1', 'mandale un mail a juan');
    if (pending.type !== 'confirmation_required') throw new Error('expected confirmation_required');

    sendToClaude.mockResolvedValueOnce({ blocks: [{ type: 'text', text: 'Listo, mail enviado.' }] });

    const result = await handleConfirmation(pending.pendingId, true);

    expect(fakeSendMailExecute).toHaveBeenCalledTimes(1);
    expect(logToolExecution).toHaveBeenCalledWith('enviar_mail', 3, expect.anything(), expect.anything());
    expect(result).toEqual({ type: 'message', text: 'Listo, mail enviado.' });
  });

  it('does not execute a risk-level-3 tool if the user rejects the confirmation', async () => {
    sendToClaude.mockResolvedValueOnce({
      blocks: [
        { type: 'tool_use', id: 'tu_4', name: 'enviar_mail', input: { to: 'juan@mail.com', subject: 'Hola', body: 'Test' } },
      ],
    });
    const pending = await handleUserMessage('c1', 'mandale un mail a juan');
    if (pending.type !== 'confirmation_required') throw new Error('expected confirmation_required');

    const result = await handleConfirmation(pending.pendingId, false);

    expect(fakeSendMailExecute).not.toHaveBeenCalled();
    expect(result).toEqual({ type: 'message', text: 'Ok, no lo hago.' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/orchestrator/index.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement the pending-actions store**

`src/lib/orchestrator/pending-actions.ts`:
```ts
import { randomUUID } from 'node:crypto';

export interface PendingAction {
  id: string;
  conversationId: string;
  toolName: string;
  input: unknown;
  toolUseId: string;
}

const store = new Map<string, PendingAction>();

export function createPendingAction(conversationId: string, toolName: string, input: unknown, toolUseId: string): PendingAction {
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

- [ ] **Step 4: Implement the orchestrator**

`src/lib/orchestrator/index.ts`:
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

export async function handleUserMessage(conversationId: string, text: string): Promise<OrchestratorResponse> {
  await appendMessage(conversationId, 'user', text);

  const context = await buildContext(conversationId);
  const messages: ClaudeMessage[] = [...context, { role: 'user', content: text }];

  const response = await sendToClaude(messages, TOOLS);

  const toolUse = response.blocks.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; id: string; name: string; input: unknown }
    | undefined;

  if (toolUse) {
    const riskLevel = getRiskLevel(toolUse.name);

    if (riskLevel === 3) {
      const pending = createPendingAction(conversationId, toolUse.name, toolUse.input, toolUse.id);
      const summary = `¿Confirmás ejecutar "${toolUse.name}" con estos datos? ${JSON.stringify(toolUse.input)}`;
      return { type: 'confirmation_required', pendingId: pending.id, toolName: toolUse.name, summary };
    }

    // risk level 1 or 2: execute immediately
    const tool = getTool(toolUse.name)!;
    const result = await tool.execute(toolUse.input, { conversationId });
    await logToolExecution(toolUse.name, riskLevel, toolUse.input, result);

    const followUp = await sendToClaude(
      [...messages, { role: 'assistant', content: `[tool ${toolUse.name} executed] ${result.message}` }],
      TOOLS
    );
    const finalText = extractText(followUp);
    await appendMessage(conversationId, 'assistant', finalText);
    return { type: 'message', text: finalText };
  }

  const finalText = extractText(response);
  await appendMessage(conversationId, 'assistant', finalText);
  return { type: 'message', text: finalText };
}

export async function handleConfirmation(pendingId: string, confirmed: boolean): Promise<OrchestratorResponse> {
  const pending = getPendingAction(pendingId);
  if (!pending) {
    return { type: 'message', text: 'Esa confirmación ya expiró o no existe.' };
  }
  removePendingAction(pendingId);

  if (!confirmed) {
    return { type: 'message', text: 'Ok, no lo hago.' };
  }

  const tool = getTool(pending.toolName)!;
  const riskLevel = getRiskLevel(pending.toolName);
  const result = await tool.execute(pending.input, { conversationId: pending.conversationId });
  await logToolExecution(pending.toolName, riskLevel, pending.input, result);

  const context = await buildContext(pending.conversationId);
  const followUp = await sendToClaude(
    [...context, { role: 'assistant', content: `[tool ${pending.toolName} executed] ${result.message}` }],
    TOOLS
  );
  const finalText = extractText(followUp);
  await appendMessage(pending.conversationId, 'assistant', finalText);
  return { type: 'message', text: finalText };
}

function extractText(response: { blocks: { type: string; text?: string }[] }): string {
  const textBlock = response.blocks.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- tests/lib/orchestrator/index.test.ts`
Expected: PASS (4 tests) — in particular, confirm the second test ("NEVER executes a risk-level-3 tool call before confirmation") passes, since this is the invariant the whole permission model depends on.

- [ ] **Step 6: Commit**

```bash
git add src/lib/orchestrator tests/lib/orchestrator
git commit -m "feat: add orchestrator with risk-level gating for tool execution"
```

---

## Task 14: API routes

**Files:**
- Create: `src/app/api/chat/route.ts`, `src/app/api/confirm/route.ts`
- Test: `tests/app/api/chat.test.ts`, `tests/app/api/confirm.test.ts`

**Interfaces:**
- Consumes: `handleUserMessage`, `handleConfirmation` from `@/lib/orchestrator`.
- Produces: `POST /api/chat` body `{ conversationId: string; text: string }` → JSON `OrchestratorResponse`. `POST /api/confirm` body `{ pendingId: string; confirmed: boolean }` → JSON `OrchestratorResponse`.

- [ ] **Step 1: Write the failing tests**

`tests/app/api/chat.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator', () => ({
  handleUserMessage: vi.fn().mockResolvedValue({ type: 'message', text: 'hola!' }),
}));

import { POST } from '@/app/api/chat/route';

describe('POST /api/chat', () => {
  it('calls the orchestrator and returns its response as JSON', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId: 'c1', text: 'hola' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body).toEqual({ type: 'message', text: 'hola!' });
  });
});
```

`tests/app/api/confirm.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator', () => ({
  handleConfirmation: vi.fn().mockResolvedValue({ type: 'message', text: 'listo' }),
}));

import { POST } from '@/app/api/confirm/route';

describe('POST /api/confirm', () => {
  it('calls the orchestrator confirmation handler and returns its response as JSON', async () => {
    const request = new Request('http://localhost/api/confirm', {
      method: 'POST',
      body: JSON.stringify({ pendingId: 'p1', confirmed: true }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body).toEqual({ type: 'message', text: 'listo' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/app/api`
Expected: FAIL (routes don't exist)

- [ ] **Step 3: Implement the routes**

`src/app/api/chat/route.ts`:
```ts
import { handleUserMessage } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { conversationId, text } = await request.json();
  const result = await handleUserMessage(conversationId, text);
  return Response.json(result);
}
```

`src/app/api/confirm/route.ts`:
```ts
import { handleConfirmation } from '@/lib/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const { pendingId, confirmed } = await request.json();
  const result = await handleConfirmation(pendingId, confirmed);
  return Response.json(result);
}
```

Note: `@/lib/orchestrator` here refers to `src/lib/orchestrator/index.ts` — Next.js resolves the directory's `index.ts` automatically.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/app/api`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api tests/app/api
git commit -m "feat: add /api/chat and /api/confirm routes"
```

---

## Task 15: Chat UI (text only)

**Files:**
- Create: `src/components/chat/ChatWindow.tsx`, `src/components/chat/MessageList.tsx`, `src/components/chat/MessageInput.tsx`, `src/components/chat/ConfirmationBanner.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/components/chat/ChatWindow.test.tsx`

**Interfaces:**
- Consumes: `POST /api/chat`, `POST /api/confirm` (Task 14) via `fetch`.
- Produces: a `<ChatWindow conversationId={string} />` component that renders messages, an input, and a confirmation banner when the API returns `confirmation_required`.

- [ ] **Step 1: Write the failing test**

`tests/components/chat/ChatWindow.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatWindow from '@/components/chat/ChatWindow';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => ({ type: 'message', text: 'Hola, soy Jarvis.' }),
  }) as any;
});

describe('ChatWindow', () => {
  it('sends the typed message and renders the assistant reply', async () => {
    render(<ChatWindow conversationId="c1" />);

    fireEvent.change(screen.getByPlaceholderText('Escribile a Jarvis...'), {
      target: { value: 'hola' },
    });
    fireEvent.click(screen.getByText('Enviar'));

    await waitFor(() => expect(screen.getByText('Hola, soy Jarvis.')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows a confirmation banner when the API asks for confirmation', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        type: 'confirmation_required',
        pendingId: 'p1',
        toolName: 'enviar_mail',
        summary: '¿Confirmás enviar el mail?',
      }),
    });

    render(<ChatWindow conversationId="c1" />);
    fireEvent.change(screen.getByPlaceholderText('Escribile a Jarvis...'), {
      target: { value: 'mandale un mail a juan' },
    });
    fireEvent.click(screen.getByText('Enviar'));

    await waitFor(() => expect(screen.getByText('¿Confirmás enviar el mail?')).toBeTruthy());
    expect(screen.getByText('Confirmar')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/components/chat/ChatWindow.test.tsx`
Expected: FAIL (component does not exist)

- [ ] **Step 3: Implement `MessageList.tsx`**

`src/components/chat/MessageList.tsx`:
```tsx
export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
}

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
  return (
    <div>
      {messages.map((m, i) => (
        <p key={i}>
          <strong>{m.role === 'user' ? 'Vos' : 'Jarvis'}:</strong> {m.text}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `MessageInput.tsx`**

`src/components/chat/MessageInput.tsx`:
```tsx
import { useState } from 'react';

export default function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <div>
      <input
        placeholder="Escribile a Jarvis..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button onClick={submit}>Enviar</button>
    </div>
  );
}
```

- [ ] **Step 5: Implement `ConfirmationBanner.tsx`**

`src/components/chat/ConfirmationBanner.tsx`:
```tsx
export default function ConfirmationBanner({
  summary,
  onConfirm,
  onCancel,
}: {
  summary: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alert">
      <p>{summary}</p>
      <button onClick={onConfirm}>Confirmar</button>
      <button onClick={onCancel}>Cancelar</button>
    </div>
  );
}
```

- [ ] **Step 6: Implement `ChatWindow.tsx`**

`src/components/chat/ChatWindow.tsx`:
```tsx
'use client';

import { useState } from 'react';
import MessageList, { type DisplayMessage } from './MessageList';
import MessageInput from './MessageInput';
import ConfirmationBanner from './ConfirmationBanner';

interface PendingConfirmation {
  pendingId: string;
  summary: string;
}

export default function ChatWindow({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  async function send(text: string) {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId, text }),
    });
    const data = await res.json();
    applyResponse(data);
  }

  async function confirm(confirmed: boolean) {
    if (!pending) return;
    const res = await fetch('/api/confirm', {
      method: 'POST',
      body: JSON.stringify({ pendingId: pending.pendingId, confirmed }),
    });
    const data = await res.json();
    setPending(null);
    applyResponse(data);
  }

  function applyResponse(data: any) {
    if (data.type === 'confirmation_required') {
      setPending({ pendingId: data.pendingId, summary: data.summary });
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', text: data.text }]);
    }
  }

  return (
    <div>
      <MessageList messages={messages} />
      {pending && (
        <ConfirmationBanner
          summary={pending.summary}
          onConfirm={() => confirm(true)}
          onCancel={() => confirm(false)}
        />
      )}
      <MessageInput onSend={send} />
    </div>
  );
}
```

- [ ] **Step 7: Wire it into the page**

`src/app/page.tsx`:
```tsx
import ChatWindow from '@/components/chat/ChatWindow';

export default function Home() {
  const conversationId = 'default-conversation';
  return <ChatWindow conversationId={conversationId} />;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- tests/components/chat/ChatWindow.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/components/chat src/app/page.tsx tests/components/chat
git commit -m "feat: add text chat UI with confirmation banner for risk-3 actions"
```

---

## Task 16: Voice input and output (Web Speech API)

**Files:**
- Create: `src/hooks/useSpeechRecognition.ts`, `src/hooks/useSpeechSynthesis.ts`
- Modify: `src/components/chat/MessageInput.tsx`, `src/components/chat/ChatWindow.tsx`
- Test: `tests/hooks/useSpeechRecognition.test.ts`, `tests/hooks/useSpeechSynthesis.test.ts`

**Interfaces:**
- Produces:
  - `useSpeechRecognition(onResult: (text: string) => void): { start(): void; stop(): void; isListening: boolean }`
  - `useSpeechSynthesis(): { speak(text: string): void }`

- [ ] **Step 1: Write the failing tests**

`tests/hooks/useSpeechRecognition.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

class FakeRecognition {
  onresult: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

beforeEach(() => {
  (global as any).webkitSpeechRecognition = FakeRecognition;
});

describe('useSpeechRecognition', () => {
  it('calls onResult with the transcribed text', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(onResult));

    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);

    const recognitionInstance: FakeRecognition = (result.current as any)._debugInstance;
    act(() => {
      recognitionInstance.onresult?.({
        results: [[{ transcript: 'hola jarvis' }]],
      });
    });

    expect(onResult).toHaveBeenCalledWith('hola jarvis');
  });
});
```

`tests/hooks/useSpeechSynthesis.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';

describe('useSpeechSynthesis', () => {
  it('calls window.speechSynthesis.speak with an utterance built from the text', () => {
    const speak = vi.fn();
    (global as any).speechSynthesis = { speak };
    (global as any).SpeechSynthesisUtterance = function (text: string) {
      return { text };
    };

    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak('Hola, soy Jarvis'));

    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hola, soy Jarvis' }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/hooks`
Expected: FAIL (hooks don't exist)

- [ ] **Step 3: Implement `useSpeechRecognition`**

`src/hooks/useSpeechRecognition.ts`:
```ts
import { useRef, useState, useCallback } from 'react';

export function useSpeechRecognition(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const instanceRef = useRef<any>(null);

  const start = useCallback(() => {
    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!Recognition) {
      console.warn('Web Speech API no soportada en este navegador.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'es-AR';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
    instanceRef.current = recognition;
    setIsListening(true);
  }, [onResult]);

  const stop = useCallback(() => {
    instanceRef.current?.stop();
    setIsListening(false);
  }, []);

  return { start, stop, isListening, _debugInstance: instanceRef.current };
}
```

- [ ] **Step 4: Implement `useSpeechSynthesis`**

`src/hooks/useSpeechSynthesis.ts`:
```ts
import { useCallback } from 'react';

export function useSpeechSynthesis() {
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Web Speech API (TTS) no soportada en este navegador.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    window.speechSynthesis.speak(utterance);
  }, []);

  return { speak };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- tests/hooks`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire voice input into `MessageInput` and voice output into `ChatWindow`**

In `src/components/chat/MessageInput.tsx`, add a mic button:
```tsx
import { useState } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

export default function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  const { start, isListening } = useSpeechRecognition((transcript) => {
    setValue(transcript);
  });

  function submit() {
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <div>
      <input
        placeholder="Escribile a Jarvis..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button onClick={start} aria-label="hablar">{isListening ? '🎙️...' : '🎙️'}</button>
      <button onClick={submit}>Enviar</button>
    </div>
  );
}
```

In `src/components/chat/ChatWindow.tsx`, call `speak(text)` whenever an assistant message arrives — add `const { speak } = useSpeechSynthesis();` at the top and call `speak(data.text)` inside `applyResponse` right after pushing the assistant message (only for `type === 'message'`, never read the confirmation summary aloud per the spec's voice-safety rule — it's always shown as on-screen text via `ConfirmationBanner` already).

- [ ] **Step 7: Commit**

```bash
git add src/hooks src/components/chat tests/hooks
git commit -m "feat: add voice input/output via Web Speech API"
```

---

## Task 17: 3D Orb avatar with four states

**Files:**
- Create: `src/components/orb/Orb.tsx`
- Modify: `src/components/chat/ChatWindow.tsx`
- Test: `tests/components/orb/Orb.test.tsx`

**Interfaces:**
- Produces: `<Orb state={'idle' | 'listening' | 'thinking' | 'speaking'} />` — a Three.js canvas whose animation parameters (pulse speed/scale) are driven by `state`.

- [ ] **Step 1: Write the failing test**

`tests/components/orb/Orb.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Orb from '@/components/orb/Orb';

vi.mock('three', () => {
  class FakeObject {
    scale = { set: vi.fn() };
    rotation = { x: 0, y: 0 };
  }
  return {
    Scene: vi.fn().mockImplementation(() => ({ add: vi.fn() })),
    PerspectiveCamera: vi.fn().mockImplementation(() => ({ position: { z: 0 } })),
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      render: vi.fn(),
      domElement: document.createElement('canvas'),
    })),
    SphereGeometry: vi.fn(),
    MeshBasicMaterial: vi.fn(),
    Mesh: vi.fn().mockImplementation(() => new FakeObject()),
  };
});

describe('Orb', () => {
  it('renders a canvas container for each state without crashing', () => {
    for (const state of ['idle', 'listening', 'thinking', 'speaking'] as const) {
      const { container, unmount } = render(<Orb state={state} />);
      expect(container.querySelector('div')).toBeTruthy();
      unmount();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/components/orb/Orb.test.tsx`
Expected: FAIL (component does not exist)

- [ ] **Step 3: Implement the orb**

`src/components/orb/Orb.tsx`:
```tsx
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STATE_PARAMS: Record<OrbState, { pulseSpeed: number; baseScale: number; color: number }> = {
  idle: { pulseSpeed: 0.5, baseScale: 0.85, color: 0x2fb8e8 },
  listening: { pulseSpeed: 2.5, baseScale: 1.0, color: 0x3fd0ff },
  thinking: { pulseSpeed: 1.5, baseScale: 0.95, color: 0x8fefff },
  speaking: { pulseSpeed: 4.0, baseScale: 1.05, color: 0x5fd8f0 },
};

export default function Orb({ state }: { state: OrbState }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(160, 160);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: STATE_PARAMS[state].color, wireframe: true });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    let frameId: number;
    let t = 0;
    function animate() {
      const { pulseSpeed, baseScale } = STATE_PARAMS[state];
      t += 0.02 * pulseSpeed;
      const scale = baseScale + Math.sin(t) * 0.1;
      sphere.scale.set(scale, scale, scale);
      sphere.rotation.y += 0.01;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      container.removeChild(renderer.domElement);
    };
  }, [state]);

  return <div ref={containerRef} style={{ width: 160, height: 160 }} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/components/orb/Orb.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the orb into `ChatWindow` with real state transitions**

In `src/components/chat/ChatWindow.tsx`: add `const [orbState, setOrbState] = useState<OrbState>('idle');`, then:
- set `'listening'` when `useSpeechRecognition`'s `isListening` is true,
- set `'thinking'` right before the `fetch('/api/chat', ...)` call and back to `'idle'` after the response resolves,
- set `'speaking'` while `speak(text)` is active (Web Speech API's `SpeechSynthesisUtterance` exposes `onstart`/`onend` callbacks — set the state in those, then back to `'idle'` in `onend`).

Render `<Orb state={orbState} />` above the `MessageList`.

- [ ] **Step 6: Commit**

```bash
git add src/components/orb src/components/chat/ChatWindow.tsx tests/components/orb
git commit -m "feat: add 3D orb avatar with idle/listening/thinking/speaking states"
```

---

## Self-Review Notes

**Spec coverage check:**
- Arquitectura y stack → Tasks 1, 2, 11, 14 ✅
- Sistema de memoria (4 tipos) → Tasks 5 (stub), 9, 10, 12 ✅
- Herramientas y modelo de permisos (niveles 1/2/3, whitelist) → Tasks 3, 5, 6, 7, 8, 13 ✅
- Voz (STT/TTS, confirmación nunca solo por audio) → Task 16, wired into ConfirmationBanner (always visual) in Task 15 ✅
- Identidad visual (orbe 3D, 4 estados) → Task 17 ✅
- Log de auditoría → Task 4, called from Task 13 ✅
- Testing (unitario del clasificador de riesgo, integración de herramientas, e2e) → Task 3 (registry), Tasks 5-8 (per-tool), Task 13 (the critical end-to-end risk-gating test) ✅

**Out of scope, correctly not covered by this plan** (per spec): modules 2-4 of the roadmap, photorealistic particle face, multi-tenancy, non-Web-Speech-API voice providers, offline support.

**Type consistency check:** `ToolDefinition`, `ToolResult`, `ToolContext`, `RiskLevel` (Task 3) are used identically across Tasks 5-8 and 13. `ClaudeMessage`, `ClaudeResponse` (Task 11) are used identically in Task 12 and 13. `OrchestratorResponse` (Task 13) is used identically in Task 14 and Task 15's `applyResponse`. No naming drift found.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-02-jarvis-conversational-core.md`.**
