# Gmail MCP integration (preparation only)

## Context

Jarvis's tool catalog (`src/lib/tools/registry.ts`) is entirely in-process today: every tool is a hand-written TypeScript function registered in a static `TOOLS` array. There is no MCP client anywhere in the codebase. `enviarMail` is currently a log-only stub (`riskLevel: 3`) with no real email backend.

The user wants Jarvis prepared to send/read Gmail via Google's official, vendor-maintained Workspace MCP server (remote, OAuth 2.0) — chosen over community npm servers because vendor-maintained servers carry the lowest risk profile (no third-party code running locally).

**Explicitly out of scope for this spec:** creating the OAuth client in Google Cloud Console, completing the OAuth consent/authorization flow, obtaining a real access token, and token refresh logic. Those require the user to act in the Google Cloud Console outside this session and are deferred to a follow-up task once the token shape from that flow is known. This spec only prepares the code so that, once `GMAIL_MCP_ACCESS_TOKEN` is set, the Gmail tools activate automatically with no further code changes.

## Architecture

Two new modules under `src/lib/mcp/`:

- **`client.ts`** — a thin, generic MCP client wrapper built on `@modelcontextprotocol/sdk`: connect to a remote MCP server over HTTP with a bearer token, list its tools, call one of its tools. Not Gmail-specific — reusable for any future MCP server (Notion, Supabase, etc.) without duplicating connection boilerplate.
- **`gmail.ts`** — Gmail-specific configuration and adaptation layer built on `client.ts`:
  - Reads `GMAIL_MCP_URL` and `GMAIL_MCP_ACCESS_TOKEN` from the environment.
  - `getGmailTools(): Promise<ToolDefinition[]>` — if no token is configured, returns `[]` immediately with no network call. Otherwise connects, lists the server's tools, and maps each into a `ToolDefinition`:
    - `name`: `gmail_<remote tool name>` (prefixed so origin is visible in the audit log and tools panel, and to avoid name collisions with local tools).
    - `description`: the remote tool's description.
    - `riskLevel`: **hardcoded to `3` for every Gmail MCP tool**, regardless of what the remote server reports. Sending/deleting/modifying mail is external and irreversible; Jarvis's own risk-gating (`getRiskLevel` → confirmation flow in `src/lib/orchestrator/index.ts`) is what protects the user, so it must not trust an external server's self-reported risk classification.
    - `inputSchema`: the remote tool's JSON schema, passed through unchanged.
    - `execute(input)`: calls the MCP tool via `client.ts` and adapts its result content into `{ success, message, data }`.

## Wiring into the existing tool loop

`registry.ts` changes from a static `TOOLS` array to an async, memoized `getTools()`:

- `LOCAL_TOOLS` — the existing static array (`consultarEstadoProyecto`, `consultarRepoGithub`, `crearRecordatorio`, `enviarMail`, `ejecutarComando`), unchanged.
- `getTools(): Promise<ToolDefinition[]>` — lazily computes and caches `[...LOCAL_TOOLS, ...(await getGmailTools())]` on first call within the process.
- `getTool(name)` and `getRiskLevel(name)` become `async`, resolving `await getTools()` and searching it.

Consumers updated to `await` the now-async calls, with no behavior change to existing tools:
- `src/lib/orchestrator/index.ts` — `sendToClaude(messages, TOOLS)` → `sendToClaude(messages, await getTools())`; the three `getRiskLevel(...)` calls and two `getTool(...)` calls gain `await`.
- `src/app/panel/page.tsx` — already an async server component; `TOOLS.map(...)` → `(await getTools()).map(...)`.
- `src/app/api/tools/execute/route.ts` — `getTool(toolName)` gains `await`.

## Error handling

If `GMAIL_MCP_ACCESS_TOKEN` is set but the server is unreachable, rejects the token, or returns a malformed tool list, `getGmailTools()` catches the error, logs it, and returns `[]`. A broken Gmail connection must degrade to "no Gmail tools available this session," never to a crashed chat loop — this mirrors the just-fixed `/api/chat` and `/api/confirm` error handling, which now always return valid JSON instead of letting an unhandled exception reach the client as an empty response body.

## Testing

- `src/lib/mcp/gmail.test.ts`:
  - No token configured → `getGmailTools()` returns `[]`, and `fetch`/the MCP client is never invoked.
  - Token configured, mocked MCP client returns two tools → both come back as `ToolDefinition`s with `gmail_` prefixed names and `riskLevel: 3`, even if the mocked remote tool claims a different risk level in its own metadata.
  - Token configured, connection throws → `getGmailTools()` returns `[]`, no exception propagates.
- `src/lib/mcp/client.test.ts`: connect/list/call against a mocked transport.
- Update `tests/lib/tools/registry.test.ts` and the four call-site tests (`orchestrator`, `panel/page`, `execute route`, `registry`) to `await` the now-async `getTools`/`getTool`/`getRiskLevel`.

## Environment

Add `GMAIL_MCP_URL` and `GMAIL_MCP_ACCESS_TOKEN` to `.env.local`, both empty (mirroring how `GITHUB_TOKEN` was added) — filled in once the user completes the OAuth flow in a follow-up task.
