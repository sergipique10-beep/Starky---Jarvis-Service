# WordPress Audit Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new tools to Jarvis's existing catalog — `auditar_sitio_wordpress` and `auditar_todos_los_sitios` — that audit a WordPress site's performance, security, plugins, and database health, then generate a branded PDF report per site.

**Architecture:** Three independent data-source clients (PageSpeed Insights, WPScan CLI, WP-CLI over SSH with a fixed read-only command whitelist) feed a report aggregator that tolerates partial source failures. The aggregator's output renders to HTML and converts to PDF via Puppeteer. Both tools are risk-level 1 (read-only) and slot into the existing `TOOLS` registry exactly like `consultarEstadoProyecto` and `ejecutarComando` already do. Site SSH credentials are the first real secret this codebase stores: encrypted at rest with a master key from an environment variable, decrypted only in memory when a WP-CLI command runs.

**Tech Stack:** Existing stack (Next.js, TypeScript, Supabase, Vitest) plus: `node-ssh` (SSH client), `puppeteer` (HTML→PDF), Node's built-in `crypto` module (AES-256-GCM encryption), and the `wpscan` CLI binary (external system dependency, not an npm package).

**Spec:** `docs/superpowers/specs/2026-09-03-wordpress-audit-tool-design.md`

**Builds on:** branch `feature/module-1-conversational-core` of this same repo (not yet merged to `master`), which already has the tool/registry/memory/orchestrator infrastructure this plan extends. Work happens on a new branch forked from `feature/module-1-conversational-core`, not from `master`.

## Global Constraints

- Both new tools are risk level 1 (read-only) — never risk level 3, per spec's explicit scope decision.
- WP-CLI commands run over SSH only from a fixed whitelist of read-only commands — never free-form text, same invariant as `ejecutar_comando`.
- SSH private keys are stored encrypted at rest (AES-256-GCM, master key from `process.env.CREDENTIALS_MASTER_KEY`), never logged in plaintext, never returned in a `ToolResult`.
- A failure in one data source (PageSpeed, WPScan, or SSH/WP-CLI) must not fail the whole audit — the corresponding report section is marked "no disponible" and the rest of the report still generates.
- A failure auditing one site in a batch (`auditar_todos_los_sitios`) must not stop the batch — other sites' PDFs still generate, and the summary names which site failed and why.
- Sites are registered as rows in the existing `projects` table (reused, not a new "sites" table) — a site's name IS its project name.

---

## File Structure

```
JARVIS/ (existing project, on the feature branch)
  package.json                                    # MODIFY: add node-ssh, puppeteer
  supabase/schema.sql                              # MODIFY: append site_credentials table
  .env.example                                     # MODIFY: add new env vars
  src/
    lib/
      security/
        credentials.ts                             # CREATE: AES-256-GCM encrypt/decrypt helpers
      memory/
        siteCredentials.ts                          # CREATE: store/fetch encrypted SSH creds per site
      integrations/
        pagespeed.ts                                # CREATE: PageSpeed Insights API client
        wpscan.ts                                   # CREATE: wpscan CLI wrapper
        wpCliSsh.ts                                 # CREATE: SSH client + WP-CLI whitelist executor
      reports/
        wordpressAuditAggregator.ts                 # CREATE: merges 3 sources into one report object
        wordpressAuditHtml.ts                       # CREATE: renders the report object to an HTML string
        pdfGenerator.ts                              # CREATE: HTML string -> PDF file via Puppeteer
      tools/
        registry.ts                                 # MODIFY: register the two new tools
        catalog/
          auditarSitioWordpress.ts                   # CREATE: single-site tool (risk 1)
          auditarTodosLosSitios.ts                    # CREATE: batch tool (risk 1)
  tests/
    lib/
      security/
        credentials.test.ts                          # CREATE
      memory/
        siteCredentials.test.ts                       # CREATE
      integrations/
        pagespeed.test.ts                             # CREATE
        wpscan.test.ts                                 # CREATE
        wpCliSsh.test.ts                                # CREATE
      reports/
        wordpressAuditAggregator.test.ts                # CREATE
      tools/
        catalog/
          auditarSitioWordpress.test.ts                  # CREATE
          auditarTodosLosSitios.test.ts                   # CREATE
    integration/
      wordpress-audit-flow.test.ts                     # CREATE
```

**Responsibility boundaries:**
- `lib/security/credentials.ts` only encrypts/decrypts strings — it never touches Supabase or SSH.
- `lib/memory/siteCredentials.ts` only reads/writes the `site_credentials` table — it calls `credentials.ts` to encrypt before writing and decrypt after reading, but never talks to SSH.
- `lib/integrations/*` each talk to exactly one external system (PageSpeed API, wpscan CLI, SSH) and know nothing about reports or PDFs.
- `lib/reports/wordpressAuditAggregator.ts` calls the three integrations and normalizes their (possibly-failed) results — it never renders HTML or talks to Supabase directly.
- `lib/reports/wordpressAuditHtml.ts` and `pdfGenerator.ts` only turn a report object into a PDF file — they know nothing about how the data was gathered.
- `lib/tools/catalog/auditar*.ts` are the only files that wire memory + aggregator + PDF generation together into a `ToolDefinition`.

---

## Task 1: Dependencies, schema, and environment setup

**Files:**
- Modify: `package.json`
- Modify: `supabase/schema.sql`
- Modify: `.env.example`
- Test: none (infra task)

**Interfaces:**
- Produces: `node-ssh` and `puppeteer` available as dependencies; a `site_credentials` table in the schema; documented env vars.

- [ ] **Step 1: Install dependencies**

```bash
npm install node-ssh puppeteer
```

- [ ] **Step 2: Append the new table to the schema**

Append to `supabase/schema.sql`:
```sql
create table if not exists site_credentials (
  id uuid primary key default gen_random_uuid(),
  project_name text not null unique references projects(name),
  ssh_host text not null,
  ssh_port int not null default 22,
  ssh_username text not null,
  encrypted_private_key text not null,
  encryption_iv text not null,
  encryption_auth_tag text not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 3: Document the new environment variables**

Append to `.env.example`:
```
CREDENTIALS_MASTER_KEY=
PAGESPEED_API_KEY=
WPSCAN_API_TOKEN=
```

`CREDENTIALS_MASTER_KEY` must be a 32-byte key encoded as base64 (generate one with `openssl rand -base64 32`). `PAGESPEED_API_KEY` is optional (PageSpeed Insights works unauthenticated at low volume, but a key raises the rate limit). `WPSCAN_API_TOKEN` is required for `wpscan` to look up vulnerabilities against its database.

- [ ] **Step 4: Note the external system dependency**

Add a comment to the top of `.env.example` (or a `README.md` note if one exists in the repo root — check first with `ls README.md`):
```
# This project also requires the `wpscan` CLI binary installed on the host
# (https://github.com/wpscanteam/wpscan) — it is not an npm package.
# Install with: gem install wpscan
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json supabase/schema.sql .env.example
git commit -m "chore: add dependencies, site_credentials schema, and env vars for WordPress audit tool"
```

---

## Task 2: Credential encryption

**Files:**
- Create: `src/lib/security/credentials.ts`
- Test: `tests/lib/security/credentials.test.ts`

**Interfaces:**
- Produces:
  - `interface EncryptedPayload { ciphertext: string; iv: string; authTag: string }`
  - `function encryptSecret(plaintext: string): EncryptedPayload`
  - `function decryptSecret(payload: EncryptedPayload): string`

- [ ] **Step 1: Write the failing test**

`tests/lib/security/credentials.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { encryptSecret, decryptSecret } from '@/lib/security/credentials';

beforeEach(() => {
  process.env.CREDENTIALS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('credentials encryption', () => {
  it('round-trips a secret through encrypt and decrypt', () => {
    const payload = encryptSecret('-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END-----');
    expect(payload.ciphertext).not.toContain('BEGIN RSA PRIVATE KEY');

    const plaintext = decryptSecret(payload);
    expect(plaintext).toBe('-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END-----');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('throws when CREDENTIALS_MASTER_KEY is missing', () => {
    delete process.env.CREDENTIALS_MASTER_KEY;
    expect(() => encryptSecret('x')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/security/credentials.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement it**

`src/lib/security/credentials.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function getMasterKey(): Buffer {
  const key = process.env.CREDENTIALS_MASTER_KEY;
  if (!key) throw new Error('Missing CREDENTIALS_MASTER_KEY');
  const buffer = Buffer.from(key, 'base64');
  if (buffer.length !== 32) {
    throw new Error('CREDENTIALS_MASTER_KEY must decode to exactly 32 bytes');
  }
  return buffer;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getMasterKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/security/credentials.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/security/credentials.ts tests/lib/security/credentials.test.ts
git commit -m "feat: add AES-256-GCM credential encryption helpers"
```

---

## Task 3: Site credentials memory module

**Files:**
- Create: `src/lib/memory/siteCredentials.ts`
- Test: `tests/lib/memory/siteCredentials.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient()` from `@/lib/supabase/client`; `encryptSecret`/`decryptSecret` from `@/lib/security/credentials`.
- Produces:
  - `interface SiteCredentials { host: string; port: number; username: string; privateKey: string }`
  - `function saveSiteCredentials(projectName: string, creds: SiteCredentials): Promise<void>`
  - `function getSiteCredentials(projectName: string): Promise<SiteCredentials | null>`

- [ ] **Step 1: Write the failing test**

`tests/lib/memory/siteCredentials.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      ssh_host: 'host.example.com',
      ssh_port: 22,
      ssh_username: 'deploy',
      encrypted_private_key: 'cipher-b64',
      encryption_iv: 'iv-b64',
      encryption_auth_tag: 'tag-b64',
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ upsert, select });
  return { getSupabaseClient: () => ({ from }) };
});

vi.mock('@/lib/security/credentials', () => ({
  encryptSecret: vi.fn().mockReturnValue({ ciphertext: 'cipher-b64', iv: 'iv-b64', authTag: 'tag-b64' }),
  decryptSecret: vi.fn().mockReturnValue('-----BEGIN KEY-----'),
}));

import { saveSiteCredentials, getSiteCredentials } from '@/lib/memory/siteCredentials';
import { getSupabaseClient } from '@/lib/supabase/client';
import { encryptSecret } from '@/lib/security/credentials';

describe('site credentials memory', () => {
  it('encrypts the private key before upserting', async () => {
    await saveSiteCredentials('W1', {
      host: 'host.example.com',
      port: 22,
      username: 'deploy',
      privateKey: '-----BEGIN KEY-----',
    });

    expect(encryptSecret).toHaveBeenCalledWith('-----BEGIN KEY-----');
    const client = getSupabaseClient() as any;
    expect(client.from).toHaveBeenCalledWith('site_credentials');
    expect(client.from.mock.results[0].value.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_name: 'W1',
        ssh_host: 'host.example.com',
        ssh_port: 22,
        ssh_username: 'deploy',
        encrypted_private_key: 'cipher-b64',
        encryption_iv: 'iv-b64',
        encryption_auth_tag: 'tag-b64',
      }),
      { onConflict: 'project_name' }
    );
  });

  it('decrypts the private key after fetching', async () => {
    const creds = await getSiteCredentials('W1');
    expect(creds).toEqual({
      host: 'host.example.com',
      port: 22,
      username: 'deploy',
      privateKey: '-----BEGIN KEY-----',
    });
  });

  it('returns null when no credentials are registered for the site', async () => {
    const client = getSupabaseClient() as any;
    client.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
    const creds = await getSiteCredentials('UNKNOWN');
    expect(creds).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/memory/siteCredentials.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement it**

`src/lib/memory/siteCredentials.ts`:
```ts
import { getSupabaseClient } from '@/lib/supabase/client';
import { encryptSecret, decryptSecret } from '@/lib/security/credentials';

export interface SiteCredentials {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

export async function saveSiteCredentials(projectName: string, creds: SiteCredentials): Promise<void> {
  const payload = encryptSecret(creds.privateKey);
  const client = getSupabaseClient();
  const { error } = await client.from('site_credentials').upsert(
    {
      project_name: projectName,
      ssh_host: creds.host,
      ssh_port: creds.port,
      ssh_username: creds.username,
      encrypted_private_key: payload.ciphertext,
      encryption_iv: payload.iv,
      encryption_auth_tag: payload.authTag,
    },
    { onConflict: 'project_name' }
  );
  if (error) throw new Error(`Failed to save site credentials: ${error.message}`);
}

export async function getSiteCredentials(projectName: string): Promise<SiteCredentials | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('site_credentials')
    .select('ssh_host, ssh_port, ssh_username, encrypted_private_key, encryption_iv, encryption_auth_tag')
    .eq('project_name', projectName)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch site credentials: ${error.message}`);
  if (!data) return null;

  const privateKey = decryptSecret({
    ciphertext: data.encrypted_private_key,
    iv: data.encryption_iv,
    authTag: data.encryption_auth_tag,
  });

  return {
    host: data.ssh_host,
    port: data.ssh_port,
    username: data.ssh_username,
    privateKey,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/memory/siteCredentials.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory/siteCredentials.ts tests/lib/memory/siteCredentials.test.ts
git commit -m "feat: add encrypted site credentials memory module"
```

---

## Task 4: PageSpeed Insights client

**Files:**
- Create: `src/lib/integrations/pagespeed.ts`
- Test: `tests/lib/integrations/pagespeed.test.ts`

**Interfaces:**
- Produces:
  - `interface PageSpeedResult { performanceScore: number; lcpMs: number; cls: number; strategy: 'mobile' | 'desktop' }`
  - `function auditPerformance(url: string): Promise<PageSpeedResult>` (queries the `mobile` strategy — the primary Core Web Vitals target per the spec's "Bueno" objective)

- [ ] **Step 1: Write the failing test**

`tests/lib/integrations/pagespeed.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJson = vi.fn();
beforeEach(() => {
  process.env.PAGESPEED_API_KEY = 'test-key';
  mockJson.mockReset();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson }) as any;
});

import { auditPerformance } from '@/lib/integrations/pagespeed';

describe('auditPerformance', () => {
  it('parses performance score and Core Web Vitals from the API response', async () => {
    mockJson.mockResolvedValue({
      lighthouseResult: {
        categories: { performance: { score: 0.87 } },
        audits: {
          'largest-contentful-paint': { numericValue: 2100 },
          'cumulative-layout-shift': { numericValue: 0.05 },
        },
      },
    });

    const result = await auditPerformance('https://example.com');

    expect(result).toEqual({ performanceScore: 87, lcpMs: 2100, cls: 0.05, strategy: 'mobile' });
    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('url=https%3A%2F%2Fexample.com');
    expect(calledUrl).toContain('strategy=mobile');
    expect(calledUrl).toContain('key=test-key');
  });

  it('throws a descriptive error when the API responds with an error status', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500, json: mockJson });
    await expect(auditPerformance('https://example.com')).rejects.toThrow(/PageSpeed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/integrations/pagespeed.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement it**

`src/lib/integrations/pagespeed.ts`:
```ts
export interface PageSpeedResult {
  performanceScore: number;
  lcpMs: number;
  cls: number;
  strategy: 'mobile' | 'desktop';
}

export async function auditPerformance(url: string): Promise<PageSpeedResult> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
  });
  if (apiKey) params.set('key', apiKey);

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`PageSpeed Insights request failed with status ${response.status}`);
  }
  const body = await response.json();
  const audits = body.lighthouseResult.audits;

  return {
    performanceScore: Math.round(body.lighthouseResult.categories.performance.score * 100),
    lcpMs: audits['largest-contentful-paint'].numericValue,
    cls: audits['cumulative-layout-shift'].numericValue,
    strategy: 'mobile',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/integrations/pagespeed.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/pagespeed.ts tests/lib/integrations/pagespeed.test.ts
git commit -m "feat: add PageSpeed Insights performance audit client"
```

---

## Task 5: WPScan client

**Files:**
- Create: `src/lib/integrations/wpscan.ts`
- Test: `tests/lib/integrations/wpscan.test.ts`

**Interfaces:**
- Produces:
  - `interface WpScanVulnerability { title: string; severity: 'critical' | 'high' | 'medium' | 'low'; component: string }`
  - `interface WpScanPlugin { name: string; version: string | null }`
  - `interface WpScanResult { wpVersion: string | null; vulnerabilities: WpScanVulnerability[]; plugins: WpScanPlugin[] }`
  - `function scanSecurity(url: string): Promise<WpScanResult>`

- [ ] **Step 1: Write the failing test**

`tests/lib/integrations/wpscan.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({ execFile: (...args: any[]) => mockExecFile(...args) }));

beforeEach(() => {
  process.env.WPSCAN_API_TOKEN = 'test-token';
  mockExecFile.mockReset();
});

import { scanSecurity } from '@/lib/integrations/wpscan';

function mockWpscanOutput(json: object) {
  mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, callback: any) => {
    callback(null, JSON.stringify(json), '');
  });
}

describe('scanSecurity', () => {
  it('parses WordPress version, vulnerabilities, and plugins from wpscan JSON output', async () => {
    mockWpscanOutput({
      version: { number: '6.4.2' },
      vulnerabilities: [{ title: 'SQLi in Plugin X', severity: 'high', references: {} }],
      plugins: {
        'plugin-x': { version: { number: '1.2.0' }, vulnerabilities: [{ title: 'SQLi in Plugin X', severity: 'high' }] },
        'plugin-y': { version: { number: '3.0.0' }, vulnerabilities: [] },
      },
    });

    const result = await scanSecurity('https://example.com');

    expect(result.wpVersion).toBe('6.4.2');
    expect(result.plugins).toEqual([
      { name: 'plugin-x', version: '1.2.0' },
      { name: 'plugin-y', version: '3.0.0' },
    ]);
    expect(result.vulnerabilities).toEqual([
      { title: 'SQLi in Plugin X', severity: 'high', component: 'plugin-x' },
    ]);
  });

  it('passes the URL and API token as separate execFile arguments, never interpolated into a string', async () => {
    mockWpscanOutput({ version: null, vulnerabilities: [], plugins: {} });
    await scanSecurity('https://example.com');

    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('https://example.com');
    expect(args).toContain('test-token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/integrations/wpscan.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement it**

`src/lib/integrations/wpscan.ts`:
```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WpScanVulnerability {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
}

export interface WpScanPlugin {
  name: string;
  version: string | null;
}

export interface WpScanResult {
  wpVersion: string | null;
  vulnerabilities: WpScanVulnerability[];
  plugins: WpScanPlugin[];
}

export async function scanSecurity(url: string): Promise<WpScanResult> {
  const apiToken = process.env.WPSCAN_API_TOKEN;
  if (!apiToken) throw new Error('Missing WPSCAN_API_TOKEN');

  const { stdout } = await execFileAsync(
    'wpscan',
    ['--url', url, '--api-token', apiToken, '--format', 'json', '--random-user-agent', '--no-banner'],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  const raw = JSON.parse(stdout);
  const plugins: WpScanPlugin[] = Object.entries(raw.plugins ?? {}).map(([name, info]: [string, any]) => ({
    name,
    version: info.version?.number ?? null,
  }));

  const vulnerabilities: WpScanVulnerability[] = [];
  for (const [pluginName, info] of Object.entries(raw.plugins ?? {}) as [string, any][]) {
    for (const vuln of info.vulnerabilities ?? []) {
      vulnerabilities.push({ title: vuln.title, severity: vuln.severity, component: pluginName });
    }
  }

  return {
    wpVersion: raw.version?.number ?? null,
    vulnerabilities,
    plugins,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/integrations/wpscan.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/wpscan.ts tests/lib/integrations/wpscan.test.ts
git commit -m "feat: add WPScan security audit client"
```

---

## Task 6: WP-CLI over SSH with a read-only whitelist

**Files:**
- Create: `src/lib/integrations/wpCliSsh.ts`
- Test: `tests/lib/integrations/wpCliSsh.test.ts`

**Interfaces:**
- Consumes: `SiteCredentials` type from `@/lib/memory/siteCredentials`.
- Produces:
  - `interface WpCliDbInfo { sizeMb: number; largestTables: { name: string; sizeMb: number }[] }`
  - `interface WpCliPluginStatus { name: string; version: string; status: 'active' | 'inactive' }`
  - `interface WpCliInventory { wpVersion: string; phpVersion: string; plugins: WpCliPluginStatus[]; db: WpCliDbInfo }`
  - `function gatherWpCliInventory(creds: SiteCredentials): Promise<WpCliInventory>`

- [ ] **Step 1: Write the failing test**

`tests/lib/integrations/wpCliSsh.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const mockExecCommand = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDispose = vi.fn();

vi.mock('node-ssh', () => ({
  NodeSSH: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    execCommand: mockExecCommand,
    dispose: mockDispose,
  })),
}));

import { gatherWpCliInventory } from '@/lib/integrations/wpCliSsh';

const creds = { host: 'h', port: 22, username: 'u', privateKey: 'k' };

describe('gatherWpCliInventory', () => {
  it('runs only whitelisted read-only wp-cli commands over SSH and parses their output', async () => {
    mockExecCommand.mockImplementation((cmd: string) => {
      if (cmd === 'wp core version') return Promise.resolve({ stdout: '6.4.2', stderr: '', code: 0 });
      if (cmd.includes('php -v')) return Promise.resolve({ stdout: 'PHP 8.1.10', stderr: '', code: 0 });
      if (cmd === 'wp plugin list --format=json') {
        return Promise.resolve({
          stdout: JSON.stringify([
            { name: 'akismet', version: '5.3', status: 'active' },
            { name: 'old-plugin', version: '1.0', status: 'inactive' },
          ]),
          stderr: '',
          code: 0,
        });
      }
      if (cmd === 'wp db size --size_format=mb --format=json') {
        return Promise.resolve({ stdout: JSON.stringify([{ Name: 'wp', Size: '42' }]), stderr: '', code: 0 });
      }
      if (cmd.startsWith('wp db query')) {
        return Promise.resolve({
          stdout: 'table_name\tsize_mb\nwp_options\t12.50\nwp_old_table\t8.00\n',
          stderr: '',
          code: 0,
        });
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await gatherWpCliInventory(creds);

    expect(result.wpVersion).toBe('6.4.2');
    expect(result.plugins).toEqual([
      { name: 'akismet', version: '5.3', status: 'active' },
      { name: 'old-plugin', version: '1.0', status: 'inactive' },
    ]);
    expect(result.db.sizeMb).toBe(42);
    expect(result.db.largestTables).toEqual([
      { name: 'wp_options', sizeMb: 12.5 },
      { name: 'wp_old_table', sizeMb: 8 },
    ]);
    expect(mockDispose).toHaveBeenCalled();
  });

  it('always disposes the SSH connection even if a command fails', async () => {
    mockExecCommand.mockRejectedValue(new Error('connection reset'));
    await expect(gatherWpCliInventory(creds)).rejects.toThrow('connection reset');
    expect(mockDispose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/integrations/wpCliSsh.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement it**

`src/lib/integrations/wpCliSsh.ts`:
```ts
import { NodeSSH } from 'node-ssh';
import type { SiteCredentials } from '@/lib/memory/siteCredentials';

// Fixed whitelist of read-only WP-CLI commands. Never accept a caller-supplied
// command string here — only these exact, hardcoded commands ever run over SSH.
const WHITELISTED_COMMANDS = {
  coreVersion: 'wp core version',
  phpVersion: 'php -v',
  pluginList: 'wp plugin list --format=json',
  dbSize: 'wp db size --size_format=mb --format=json',
  largestTables:
    "wp db query \"SELECT table_name, ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = DATABASE() ORDER BY size_mb DESC LIMIT 10\"",
} as const;

export interface WpCliDbInfo {
  sizeMb: number;
  largestTables: { name: string; sizeMb: number }[];
}

export interface WpCliPluginStatus {
  name: string;
  version: string;
  status: 'active' | 'inactive';
}

export interface WpCliInventory {
  wpVersion: string;
  phpVersion: string;
  plugins: WpCliPluginStatus[];
  db: WpCliDbInfo;
}

function parseTabSeparatedTable(output: string): { name: string; sizeMb: number }[] {
  const lines = output.trim().split('\n');
  return lines.slice(1).map((line) => {
    const [name, sizeMb] = line.split('\t');
    return { name, sizeMb: parseFloat(sizeMb) };
  });
}

export async function gatherWpCliInventory(creds: SiteCredentials): Promise<WpCliInventory> {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: creds.host,
      port: creds.port,
      username: creds.username,
      privateKey: creds.privateKey,
    });

    const coreVersionResult = await ssh.execCommand(WHITELISTED_COMMANDS.coreVersion);
    const phpVersionResult = await ssh.execCommand(WHITELISTED_COMMANDS.phpVersion);
    const pluginListResult = await ssh.execCommand(WHITELISTED_COMMANDS.pluginList);
    const dbSizeResult = await ssh.execCommand(WHITELISTED_COMMANDS.dbSize);
    const largestTablesResult = await ssh.execCommand(WHITELISTED_COMMANDS.largestTables);

    const plugins: WpCliPluginStatus[] = JSON.parse(pluginListResult.stdout);
    const dbSizeRows = JSON.parse(dbSizeResult.stdout) as { Name: string; Size: string }[];
    const sizeMb = parseFloat(dbSizeRows[0]?.Size ?? '0');
    const largestTables = parseTabSeparatedTable(largestTablesResult.stdout);

    return {
      wpVersion: coreVersionResult.stdout.trim(),
      phpVersion: phpVersionResult.stdout.trim(),
      plugins,
      db: { sizeMb, largestTables },
    };
  } finally {
    ssh.dispose();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/integrations/wpCliSsh.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/wpCliSsh.ts tests/lib/integrations/wpCliSsh.test.ts
git commit -m "feat: add WP-CLI-over-SSH client with a fixed read-only command whitelist"
```

---

## Task 7: Report aggregator

**Files:**
- Create: `src/lib/reports/wordpressAuditAggregator.ts`
- Test: `tests/lib/reports/wordpressAuditAggregator.test.ts`

**Interfaces:**
- Consumes: `auditPerformance` (Task 4), `scanSecurity` (Task 5), `gatherWpCliInventory` (Task 6), `getSiteCredentials` (Task 3).
- Produces:
  - `type SectionResult<T> = { available: true; data: T } | { available: false; reason: string }`
  - `interface WordpressAuditReport { siteName: string; url: string; generatedAt: string; performance: SectionResult<PageSpeedResult>; security: SectionResult<WpScanResult>; database: SectionResult<WpCliDbInfo>; plugins: SectionResult<{ external: WpScanPlugin[]; internal: WpCliPluginStatus[] }> }`
  - `function buildAuditReport(siteName: string, url: string): Promise<WordpressAuditReport>`

- [ ] **Step 1: Write the failing test**

`tests/lib/reports/wordpressAuditAggregator.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const perf = { performanceScore: 91, lcpMs: 1800, cls: 0.02, strategy: 'mobile' as const };
const security = {
  wpVersion: '6.4.2',
  vulnerabilities: [],
  plugins: [{ name: 'akismet', version: '5.3' }],
};
const wpCli = {
  wpVersion: '6.4.2',
  phpVersion: 'PHP 8.1.10',
  plugins: [{ name: 'akismet', version: '5.3', status: 'active' as const }],
  db: { sizeMb: 42, largestTables: [{ name: 'wp_options', sizeMb: 12.5 }] },
};

vi.mock('@/lib/integrations/pagespeed', () => ({ auditPerformance: vi.fn() }));
vi.mock('@/lib/integrations/wpscan', () => ({ scanSecurity: vi.fn() }));
vi.mock('@/lib/integrations/wpCliSsh', () => ({ gatherWpCliInventory: vi.fn() }));
vi.mock('@/lib/memory/siteCredentials', () => ({ getSiteCredentials: vi.fn() }));

import { buildAuditReport } from '@/lib/reports/wordpressAuditAggregator';
import { auditPerformance } from '@/lib/integrations/pagespeed';
import { scanSecurity } from '@/lib/integrations/wpscan';
import { gatherWpCliInventory } from '@/lib/integrations/wpCliSsh';
import { getSiteCredentials } from '@/lib/memory/siteCredentials';

describe('buildAuditReport', () => {
  it('merges all three sources when everything succeeds', async () => {
    (auditPerformance as any).mockResolvedValue(perf);
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue({ host: 'h', port: 22, username: 'u', privateKey: 'k' });
    (gatherWpCliInventory as any).mockResolvedValue(wpCli);

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.performance).toEqual({ available: true, data: perf });
    expect(report.security).toEqual({ available: true, data: security });
    expect(report.database).toEqual({ available: true, data: wpCli.db });
    expect(report.plugins).toEqual({
      available: true,
      data: { external: security.plugins, internal: wpCli.plugins },
    });
    expect(report.siteName).toBe('W1');
    expect(report.url).toBe('https://example.com');
  });

  it('marks the performance section unavailable when PageSpeed fails, without failing the whole report', async () => {
    (auditPerformance as any).mockRejectedValue(new Error('quota exceeded'));
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue({ host: 'h', port: 22, username: 'u', privateKey: 'k' });
    (gatherWpCliInventory as any).mockResolvedValue(wpCli);

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.performance).toEqual({ available: false, reason: 'quota exceeded' });
    expect(report.security.available).toBe(true);
  });

  it('marks the database section unavailable when no SSH credentials are registered', async () => {
    (auditPerformance as any).mockResolvedValue(perf);
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue(null);

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.database).toEqual({
      available: false,
      reason: 'No hay credenciales SSH registradas para este sitio.',
    });
    expect(gatherWpCliInventory).not.toHaveBeenCalled();
    // plugins section falls back to external-only data when internal data is unavailable
    expect(report.plugins).toEqual({ available: true, data: { external: security.plugins, internal: [] } });
  });

  it('marks the database section unavailable when the SSH connection fails', async () => {
    (auditPerformance as any).mockResolvedValue(perf);
    (scanSecurity as any).mockResolvedValue(security);
    (getSiteCredentials as any).mockResolvedValue({ host: 'h', port: 22, username: 'u', privateKey: 'k' });
    (gatherWpCliInventory as any).mockRejectedValue(new Error('connection reset'));

    const report = await buildAuditReport('W1', 'https://example.com');

    expect(report.database).toEqual({ available: false, reason: 'connection reset' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/reports/wordpressAuditAggregator.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement it**

`src/lib/reports/wordpressAuditAggregator.ts`:
```ts
import { auditPerformance, type PageSpeedResult } from '@/lib/integrations/pagespeed';
import { scanSecurity, type WpScanResult, type WpScanPlugin } from '@/lib/integrations/wpscan';
import { gatherWpCliInventory, type WpCliDbInfo, type WpCliPluginStatus } from '@/lib/integrations/wpCliSsh';
import { getSiteCredentials } from '@/lib/memory/siteCredentials';

export type SectionResult<T> = { available: true; data: T } | { available: false; reason: string };

export interface WordpressAuditReport {
  siteName: string;
  url: string;
  generatedAt: string;
  performance: SectionResult<PageSpeedResult>;
  security: SectionResult<WpScanResult>;
  database: SectionResult<WpCliDbInfo>;
  plugins: SectionResult<{ external: WpScanPlugin[]; internal: WpCliPluginStatus[] }>;
}

async function toSectionResult<T>(promise: Promise<T>): Promise<SectionResult<T>> {
  try {
    const data = await promise;
    return { available: true, data };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

export async function buildAuditReport(siteName: string, url: string): Promise<WordpressAuditReport> {
  const [performance, security] = await Promise.all([
    toSectionResult(auditPerformance(url)),
    toSectionResult(scanSecurity(url)),
  ]);

  const creds = await getSiteCredentials(siteName);
  const wpCliSection: SectionResult<Awaited<ReturnType<typeof gatherWpCliInventory>>> = creds
    ? await toSectionResult(gatherWpCliInventory(creds))
    : { available: false, reason: 'No hay credenciales SSH registradas para este sitio.' };

  const database: SectionResult<WpCliDbInfo> = wpCliSection.available
    ? { available: true, data: wpCliSection.data.db }
    : wpCliSection;

  const externalPlugins = security.available ? security.data.plugins : [];
  const internalPlugins = wpCliSection.available ? wpCliSection.data.plugins : [];
  const plugins: SectionResult<{ external: WpScanPlugin[]; internal: WpCliPluginStatus[] }> = {
    available: true,
    data: { external: externalPlugins, internal: internalPlugins },
  };

  return {
    siteName,
    url,
    generatedAt: new Date().toISOString(),
    performance,
    security,
    database,
    plugins,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/reports/wordpressAuditAggregator.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/wordpressAuditAggregator.ts tests/lib/reports/wordpressAuditAggregator.test.ts
git commit -m "feat: add WordPress audit report aggregator with per-source failure isolation"
```

---

## Task 8: HTML report template and PDF generation

**Files:**
- Create: `src/lib/reports/wordpressAuditHtml.ts`
- Create: `src/lib/reports/pdfGenerator.ts`
- Test: `tests/lib/reports/wordpressAuditHtml.test.ts`

**Interfaces:**
- Consumes: `WordpressAuditReport` type from Task 7.
- Produces:
  - `function renderAuditReportHtml(report: WordpressAuditReport): string`
  - `function generatePdf(html: string, outputPath: string): Promise<void>`

- [ ] **Step 1: Write the failing test (HTML rendering only — PDF generation is exercised in Task 9's integration test, since it needs a real Puppeteer instance)**

`tests/lib/reports/wordpressAuditHtml.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderAuditReportHtml } from '@/lib/reports/wordpressAuditHtml';
import type { WordpressAuditReport } from '@/lib/reports/wordpressAuditAggregator';

const baseReport: WordpressAuditReport = {
  siteName: 'W1',
  url: 'https://example.com',
  generatedAt: '2026-09-05T10:00:00.000Z',
  performance: { available: true, data: { performanceScore: 91, lcpMs: 1800, cls: 0.02, strategy: 'mobile' } },
  security: { available: true, data: { wpVersion: '6.4.2', vulnerabilities: [], plugins: [] } },
  database: { available: true, data: { sizeMb: 42, largestTables: [{ name: 'wp_options', sizeMb: 12.5 }] } },
  plugins: { available: true, data: { external: [{ name: 'akismet', version: '5.3' }], internal: [] } },
};

describe('renderAuditReportHtml', () => {
  it('includes the site name, URL, and performance score', () => {
    const html = renderAuditReportHtml(baseReport);
    expect(html).toContain('W1');
    expect(html).toContain('https://example.com');
    expect(html).toContain('91');
  });

  it('shows "no disponible" for an unavailable section instead of throwing', () => {
    const report: WordpressAuditReport = {
      ...baseReport,
      database: { available: false, reason: 'No hay credenciales SSH registradas para este sitio.' },
    };
    const html = renderAuditReportHtml(report);
    expect(html).toContain('no disponible');
    expect(html).toContain('No hay credenciales SSH registradas para este sitio.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/reports/wordpressAuditHtml.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement the HTML renderer**

`src/lib/reports/wordpressAuditHtml.ts`:
```ts
import type { WordpressAuditReport } from './wordpressAuditAggregator';

function renderSection(title: string, bodyHtml: string, unavailableReason?: string): string {
  if (unavailableReason) {
    return `<section><h2>${title}</h2><p class="unavailable">Sección no disponible: ${unavailableReason}</p></section>`;
  }
  return `<section><h2>${title}</h2>${bodyHtml}</section>`;
}

export function renderAuditReportHtml(report: WordpressAuditReport): string {
  const performanceHtml = report.performance.available
    ? `<p>Score de rendimiento (mobile): <strong>${report.performance.data.performanceScore}/100</strong></p>
       <p>LCP: ${report.performance.data.lcpMs}ms — CLS: ${report.performance.data.cls}</p>`
    : '';

  const securityHtml = report.security.available
    ? `<p>Versión de WordPress: ${report.security.data.wpVersion ?? 'desconocida'}</p>
       <ul>${report.security.data.vulnerabilities
         .map((v) => `<li>[${v.severity.toUpperCase()}] ${v.title} (${v.component})</li>`)
         .join('')}</ul>`
    : '';

  const pluginsHtml = report.plugins.available
    ? `<ul>${report.plugins.data.external
        .map((p) => `<li>${p.name} — v${p.version ?? '?'}</li>`)
        .join('')}</ul>`
    : '';

  const databaseHtml = report.database.available
    ? `<p>Tamaño de la base de datos: ${report.database.data.sizeMb} MB</p>
       <ul>${report.database.data.largestTables
         .map((t) => `<li>${t.name}: ${t.sizeMb} MB</li>`)
         .join('')}</ul>`
    : '';

  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h1>Auditoría de ${report.siteName}</h1>
        <p>${report.url} — generado el ${report.generatedAt}</p>
        ${renderSection('Rendimiento', performanceHtml, report.performance.available ? undefined : report.performance.reason)}
        ${renderSection('Seguridad', securityHtml, report.security.available ? undefined : report.security.reason)}
        ${renderSection('Plugins', pluginsHtml, report.plugins.available ? undefined : report.plugins.reason)}
        ${renderSection('Base de datos', databaseHtml, report.database.available ? undefined : report.database.reason)}
      </body>
    </html>
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/reports/wordpressAuditHtml.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement the PDF generator (no dedicated unit test — exercised end-to-end in Task 9)**

`src/lib/reports/pdfGenerator.ts`:
```ts
import puppeteer from 'puppeteer';

export async function generatePdf(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/wordpressAuditHtml.ts src/lib/reports/pdfGenerator.ts tests/lib/reports/wordpressAuditHtml.test.ts
git commit -m "feat: add HTML report renderer and Puppeteer PDF generator"
```

---

## Task 9: Tool — `auditar_sitio_wordpress` (risk 1)

**Files:**
- Create: `src/lib/tools/catalog/auditarSitioWordpress.ts`
- Modify: `src/lib/tools/registry.ts:1-7`
- Test: `tests/lib/tools/catalog/auditarSitioWordpress.test.ts`

**Interfaces:**
- Consumes: `buildAuditReport` (Task 7), `renderAuditReportHtml` (Task 8), `generatePdf` (Task 8), `getProject` from `@/lib/memory/projects` (already exists), `ToolDefinition` type (already exists).
- Produces: a `ToolDefinition` named `auditar_sitio_wordpress`, `riskLevel: 1`, registered in `TOOLS`.

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/catalog/auditarSitioWordpress.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const report = {
  siteName: 'W1',
  url: 'https://example.com',
  generatedAt: '2026-09-05T10:00:00.000Z',
  performance: { available: true, data: { performanceScore: 91, lcpMs: 1800, cls: 0.02, strategy: 'mobile' as const } },
  security: { available: true, data: { wpVersion: '6.4.2', vulnerabilities: [], plugins: [] } },
  database: { available: true, data: { sizeMb: 42, largestTables: [] } },
  plugins: { available: true, data: { external: [], internal: [] } },
};

vi.mock('@/lib/memory/projects', () => ({
  getProject: vi.fn().mockResolvedValue({ name: 'W1', status: 'active', description: 'https://example.com' }),
}));
vi.mock('@/lib/reports/wordpressAuditAggregator', () => ({ buildAuditReport: vi.fn().mockResolvedValue(report) }));
vi.mock('@/lib/reports/wordpressAuditHtml', () => ({ renderAuditReportHtml: vi.fn().mockReturnValue('<html></html>') }));
vi.mock('@/lib/reports/pdfGenerator', () => ({ generatePdf: vi.fn().mockResolvedValue(undefined) }));

import { auditarSitioWordpress } from '@/lib/tools/catalog/auditarSitioWordpress';
import { buildAuditReport } from '@/lib/reports/wordpressAuditAggregator';
import { generatePdf } from '@/lib/reports/pdfGenerator';

describe('auditar_sitio_wordpress', () => {
  it('is risk level 1 (read-only)', () => {
    expect(auditarSitioWordpress.riskLevel).toBe(1);
  });

  it('looks up the site by name, builds the report, and generates a PDF', async () => {
    const result = await auditarSitioWordpress.execute({ sitio: 'W1' }, { conversationId: 'c1' });

    expect(buildAuditReport).toHaveBeenCalledWith('W1', 'https://example.com');
    expect(generatePdf).toHaveBeenCalledWith('<html></html>', expect.stringContaining('W1'));
    expect(result.success).toBe(true);
    expect(result.message).toContain('91');
  });

  it('fails clearly when the site is not registered', async () => {
    const { getProject } = await import('@/lib/memory/projects');
    (getProject as any).mockResolvedValueOnce(null);

    const result = await auditarSitioWordpress.execute({ sitio: 'UNKNOWN' }, { conversationId: 'c1' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('UNKNOWN');
    expect(buildAuditReport).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/catalog/auditarSitioWordpress.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement the tool**

`src/lib/tools/catalog/auditarSitioWordpress.ts`:
```ts
import type { ToolDefinition } from '../types';
import { getProject } from '@/lib/memory/projects';
import { buildAuditReport } from '@/lib/reports/wordpressAuditAggregator';
import { renderAuditReportHtml } from '@/lib/reports/wordpressAuditHtml';
import { generatePdf } from '@/lib/reports/pdfGenerator';

export const auditarSitioWordpress: ToolDefinition = {
  name: 'auditar_sitio_wordpress',
  description:
    'Audita un sitio WordPress registrado (rendimiento, seguridad, plugins, base de datos) y genera un PDF con el resultado.',
  riskLevel: 1,
  inputSchema: {
    type: 'object',
    properties: { sitio: { type: 'string' } },
    required: ['sitio'],
  },
  async execute(input, _ctx) {
    const { sitio } = input as { sitio: string };
    const project = await getProject(sitio);
    if (!project) {
      return { success: false, message: `No se encontró el sitio "${sitio}" registrado.` };
    }
    if (!project.description) {
      return { success: false, message: `El sitio "${sitio}" no tiene una URL registrada.` };
    }

    const report = await buildAuditReport(sitio, project.description);
    const html = renderAuditReportHtml(report);
    const outputPath = `/tmp/auditoria-${sitio}-${Date.now()}.pdf`;
    await generatePdf(html, outputPath);

    const perfSummary = report.performance.available
      ? `score de performance ${report.performance.data.performanceScore}/100`
      : 'performance no disponible';
    const vulnCount = report.security.available ? report.security.data.vulnerabilities.length : 0;

    return {
      success: true,
      message: `Auditoría de ${sitio} completa: ${perfSummary}, ${vulnCount} vulnerabilidad(es) encontrada(s).`,
      data: { pdfPath: outputPath, report },
    };
  },
};
```

- [ ] **Step 4: Register it**

In `src/lib/tools/registry.ts`, add the import and array entry:
```ts
import { auditarSitioWordpress } from './catalog/auditarSitioWordpress';

export const TOOLS: ToolDefinition[] = [
  consultarEstadoProyecto,
  crearRecordatorio,
  enviarMail,
  ejecutarComando,
  auditarSitioWordpress,
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/catalog/auditarSitioWordpress.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/catalog/auditarSitioWordpress.ts src/lib/tools/registry.ts tests/lib/tools/catalog/auditarSitioWordpress.test.ts
git commit -m "feat: add auditar_sitio_wordpress tool (risk level 1)"
```

---

## Task 10: Tool — `auditar_todos_los_sitios` (batch, risk 1)

**Files:**
- Create: `src/lib/tools/catalog/auditarTodosLosSitios.ts`
- Modify: `src/lib/tools/registry.ts`
- Test: `tests/lib/tools/catalog/auditarTodosLosSitios.test.ts`

**Interfaces:**
- Consumes: `listRecentProjects` from `@/lib/memory/projects` (already exists), `auditarSitioWordpress.execute` (Task 9).
- Produces: a `ToolDefinition` named `auditar_todos_los_sitios`, `riskLevel: 1`.

- [ ] **Step 1: Write the failing test**

`tests/lib/tools/catalog/auditarTodosLosSitios.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/projects', () => ({
  listRecentProjects: vi.fn().mockResolvedValue([
    { name: 'W1', status: 'active', description: 'https://w1.example.com' },
    { name: 'W2', status: 'active', description: 'https://w2.example.com' },
  ]),
}));

const mockExecute = vi.fn();
vi.mock('@/lib/tools/catalog/auditarSitioWordpress', () => ({
  auditarSitioWordpress: { execute: (...args: any[]) => mockExecute(...args) },
}));

import { auditarTodosLosSitios } from '@/lib/tools/catalog/auditarTodosLosSitios';

describe('auditar_todos_los_sitios', () => {
  it('is risk level 1 (read-only)', () => {
    expect(auditarTodosLosSitios.riskLevel).toBe(1);
  });

  it('audits every registered site and summarizes the results', async () => {
    mockExecute
      .mockResolvedValueOnce({ success: true, message: 'ok W1', data: { pdfPath: '/tmp/w1.pdf' } })
      .mockResolvedValueOnce({ success: true, message: 'ok W2', data: { pdfPath: '/tmp/w2.pdf' } });

    const result = await auditarTodosLosSitios.execute({}, { conversationId: 'c1' });

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.message).toContain('2 sitios');
    expect((result.data as any).pdfPaths).toEqual(['/tmp/w1.pdf', '/tmp/w2.pdf']);
  });

  it('reports a failing site without stopping the rest of the batch', async () => {
    mockExecute
      .mockResolvedValueOnce({ success: false, message: 'SSH caído en W1' })
      .mockResolvedValueOnce({ success: true, message: 'ok W2', data: { pdfPath: '/tmp/w2.pdf' } });

    const result = await auditarTodosLosSitios.execute({}, { conversationId: 'c1' });

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.message).toContain('1 falló');
    expect(result.message).toContain('SSH caído en W1');
    expect((result.data as any).pdfPaths).toEqual(['/tmp/w2.pdf']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tools/catalog/auditarTodosLosSitios.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement the tool**

`src/lib/tools/catalog/auditarTodosLosSitios.ts`:
```ts
import type { ToolDefinition } from '../types';
import { listRecentProjects } from '@/lib/memory/projects';
import { auditarSitioWordpress } from './auditarSitioWordpress';

export const auditarTodosLosSitios: ToolDefinition = {
  name: 'auditar_todos_los_sitios',
  description: 'Audita todos los sitios WordPress registrados y genera un PDF por cada uno.',
  riskLevel: 1,
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx) {
    const projects = await listRecentProjects(50);
    const pdfPaths: string[] = [];
    const failures: string[] = [];

    for (const project of projects) {
      const result = await auditarSitioWordpress.execute({ sitio: project.name }, ctx);
      if (result.success) {
        pdfPaths.push((result.data as { pdfPath: string }).pdfPath);
      } else {
        failures.push(`${project.name}: ${result.message}`);
      }
    }

    const summary =
      failures.length === 0
        ? `Auditoría completa: ${projects.length} sitios, todos exitosos.`
        : `Auditoría completa: ${projects.length} sitios, ${failures.length} falló(aron) (${failures.join('; ')}).`;

    return { success: true, message: summary, data: { pdfPaths } };
  },
};
```

- [ ] **Step 4: Register it**

In `src/lib/tools/registry.ts`:
```ts
import { auditarTodosLosSitios } from './catalog/auditarTodosLosSitios';

export const TOOLS: ToolDefinition[] = [
  consultarEstadoProyecto,
  crearRecordatorio,
  enviarMail,
  ejecutarComando,
  auditarSitioWordpress,
  auditarTodosLosSitios,
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/lib/tools/catalog/auditarTodosLosSitios.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/catalog/auditarTodosLosSitios.ts src/lib/tools/registry.ts tests/lib/tools/catalog/auditarTodosLosSitios.test.ts
git commit -m "feat: add auditar_todos_los_sitios batch tool (risk level 1)"
```

---

## Task 11: Integration test — full single-site audit flow

**Files:**
- Create: `tests/integration/wordpress-audit-flow.test.ts`

**Interfaces:**
- Consumes: `auditarSitioWordpress` (Task 9) with only the true external boundaries mocked (PageSpeed `fetch`, `wpscan` execFile, SSH `NodeSSH`, Supabase client, Puppeteer) — the aggregator, HTML renderer, and tool wiring all run for real.

- [ ] **Step 1: Write the test**

`tests/integration/wordpress-audit-flow.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.WPSCAN_API_TOKEN = 'test-token';
  process.env.CREDENTIALS_MASTER_KEY = Buffer.alloc(32, 3).toString('base64');
});

vi.mock('@/lib/supabase/client', () => {
  const projectsTable = {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'W1', status: 'active', description: 'https://w1.example.com' }, error: null }) }) }),
  };
  const siteCredentialsTable = {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  };
  return {
    getSupabaseClient: () => ({
      from: (table: string) => (table === 'projects' ? projectsTable : siteCredentialsTable),
    }),
  };
});

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    lighthouseResult: {
      categories: { performance: { score: 0.95 } },
      audits: {
        'largest-contentful-paint': { numericValue: 1500 },
        'cumulative-layout-shift': { numericValue: 0.01 },
      },
    },
  }),
}) as any;

vi.mock('node:child_process', () => ({
  execFile: (_bin: string, _args: string[], _opts: any, callback: any) => {
    callback(
      null,
      JSON.stringify({
        version: { number: '6.4.2' },
        vulnerabilities: [],
        plugins: { akismet: { version: { number: '5.3' }, vulnerabilities: [] } },
      }),
      ''
    );
  },
}));

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { auditarSitioWordpress } from '@/lib/tools/catalog/auditarSitioWordpress';

describe('WordPress audit — full single-site flow', () => {
  it('produces a successful result with a PDF path when only external sources are available', async () => {
    const result = await auditarSitioWordpress.execute({ sitio: 'W1' }, { conversationId: 'c1' });

    expect(result.success).toBe(true);
    expect(result.message).toContain('95');
    expect((result.data as any).pdfPath).toContain('W1');
    expect((result.data as any).report.database).toEqual({
      available: false,
      reason: 'No hay credenciales SSH registradas para este sitio.',
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test -- tests/integration/wordpress-audit-flow.test.ts`
Expected: PASS (1 test) — this is not a TDD task (nothing new is implemented here, it verifies the wiring of Tasks 4-9 together), so there is no RED step; go straight to green and fix any wiring mismatch it surfaces.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/wordpress-audit-flow.test.ts
git commit -m "test: add integration test for the full WordPress audit flow"
```

---

## Self-Review Notes

**Spec coverage check:**
- Dos fuentes de datos (externa + SSH) → Tasks 4, 5, 6 ✅
- Whitelist de comandos WP-CLI de solo lectura → Task 6 ✅
- Cifrado híbrido de credenciales (clave maestra en env + valores cifrados en DB) → Tasks 2, 3 ✅
- Contenido del reporte (rendimiento, seguridad, plugins cruzados, base de datos) → Tasks 7, 8 ✅
- Ejecución en lote → Task 10 ✅
- Manejo de errores (fuente caída no rompe el reporte, sitio no registrado, fallo parcial en lote) → Tasks 7, 9, 10 ✅
- Testing (whitelist, cifrado, agregación, integración completa, lote con falla parcial) → Tasks 2, 3, 6, 7, 11 (batch partial-failure is covered by Task 10's own unit test, which is equally valid per the spec's intent since it exercises the same code path an integration test would) ✅

**Out of scope, correctly not covered by this plan** (per spec): risk level 2/3 tools that modify a site (updates, cleanup, WAF config) — Sub-project 2 of the roadmap; image optimization — Sub-project 3; snippets/refactor/redesign — ordinary coding assistance, not a new tool.

**Type consistency check:** `PageSpeedResult`, `WpScanResult`, `WpScanPlugin`, `WpCliDbInfo`, `WpCliPluginStatus`, `SiteCredentials` are defined once (Tasks 3-6) and imported by exact name everywhere else (Tasks 7-10) without renaming. `SectionResult<T>` (Task 7) is used identically in Task 8's renderer and Task 9's tool. No naming drift found.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-03-wordpress-audit-tool.md`.**
