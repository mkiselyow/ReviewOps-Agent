# Prompt: expose ReviewOps as an MCP server (token-authenticated)

> Implementation prompt for a coding agent (written for Google Antigravity).
> Goal: any MCP client (Gemini CLI, Claude Desktop, MCP Inspector) can query a
> manager's evidence, questionnaire status, and generate review drafts through
> ReviewOps' own MCP server — with the app's existing RBAC still enforced in
> code, and identity derived from a manager-issued access token, never from
> request input.

---

## The prompt

You are working in the repo `ReviewOps-Agent` (Next.js 16 + TypeScript frontend in `src/`, Python ADK agent service in `agent-service/` — you will NOT touch the Python side). Read `docs/ARCHITECTURE.md` and skim `src/server/services/` and `src/server/auth/` before writing code.

**Context.** ReviewOps grounds performance reviews in consented evidence. The TS app is the security boundary: services in `src/server/services/` take an explicit `managerId` and trust the caller to have enforced permissions first — route handlers gate every call via `requireManager()` plus the pure predicates in `src/server/auth/permissions.ts` and `src/server/auth/rbac.ts`. You will add a second, non-HTTP entry surface: an **MCP server** that exposes read + draft capabilities to MCP clients, replicating exactly the same gating. Two modules are Next.js-bound and MUST NOT be imported by anything you write for the MCP process: `src/server/auth/mockSession.ts` (next/headers) and `src/server/http.ts` (next/server). Everything else in `src/server/` is plain Node and safe to reuse.

**Security invariants (do not violate):**
- Identity comes from a token in the server's environment, resolved against a stored hash — never from a tool parameter and never trusted from the LLM. (Same rule as survey links: `src/server/utils/crypto.ts` + `survey_assignments.token_hash` store only the SHA-256 hash.)
- The token value must never appear in tool results, error messages, or logs.
- Approval and export are deliberately **excluded** from the MCP surface — human-in-the-loop stays in the UI.
- Every scoped call re-asserts permissions with the existing predicates; denials are audited.

### Part 1 — MCP access tokens (app side)

1. **Schema** (`src/server/db/schema.ts` + `drizzle-kit` migration): new table `mcp_tokens` — `id` (pk), `user_id` (FK → users), `token_hash` (unique, SHA-256 hex), `label` (nullable), `created_at`, `last_used_at` (nullable), `expires_at` (nullable), `revoked` (boolean, default false). Additive only; nothing existing changes.
2. **Service** (`src/server/services/mcpTokenService.ts`):
   - `issueToken(userId, label?)` → plaintext `rop_` + base64url(`crypto.randomBytes(32)`); store ONLY the SHA-256 hash; return the plaintext once. Reuse the hashing helper from `src/server/utils/crypto.ts` if suitable.
   - `resolveToken(plaintext)` → hash → lookup → returns the active `userId` or `null` (rejects revoked/expired; updates `last_used_at`).
   - `listTokens(userId)` (id, label, created/last-used/expiry, revoked — never hashes), `revokeToken(userId, tokenId)`.
3. **Routes + UI**: a minimal "MCP access" section on the manager side (dashboard or a small settings page):
   - Generate (label optional) → show the plaintext ONCE with a copy button and the warning "store it now; we only keep a hash".
   - List + revoke.
   - Route handlers gated with `requireManager()` (from `src/server/http.ts` — fine here, this is the Next side); issuance/revocation logged via `logAudit` (`src/server/services/auditService.ts`; extend the `AuditAction` union with e.g. `mcp_token_issued` / `mcp_token_revoked`).
   - Managers only (`isManager` — demo Maria included, so judges can reproduce the whole flow).
4. Follow the existing UI style; keep it small — one card/section, no new nav concepts if avoidable.

### Part 2 — the MCP server

1. **File** `src/mcp/reviewops-server.ts`, using the official `@modelcontextprotocol/sdk` (add as dependency) with the **stdio** transport. Server name `reviewops`, version from package.json. Add package.json script `"mcp:reviewops": "tsx src/mcp/reviewops-server.ts"` (tsx is already a dependency).
2. **Startup identity**: read `REVIEWOPS_MCP_TOKEN` from env → `resolveToken` → `isManager(userId)` (from `src/server/services/hrisService.ts`). On any failure: print a clear, token-free message to **stderr** and exit non-zero before serving tools. Cache the acting `managerId` for the process lifetime.
3. **DB note**: `src/server/db/index.ts` initializes from `DATABASE_URL` (default `file:./data/reviewops.sqlite`, resolved against `process.cwd()`). Document in the README snippet that the MCP client config must set `cwd` to the repo root (or pass an absolute `DATABASE_URL` in env).
4. **Tools** (zod input schemas — zod is already a dependency; results as JSON in a `text` content block; one-line descriptions written for an MCP client):

| Tool | Input | Backing calls (in order) |
|---|---|---|
| `list_direct_reports` | — | `getDirectReports(actor)` (`hrisService`) |
| `list_questionnaires` | — | `listQuestionnairesByManager(actor)` (`surveyService`) |
| `get_questionnaire_results` | `{ questionnaireId }` | `getQuestionnaire` → `assertOwnsQuestionnaire(actor, q)` (`rbac.ts`) → `getQuestionnaireResults(actor, id)` |
| `get_evidence_summary` | `{ employeeId, period? }` | `getEmployeeProfile` → `assertManagerCanViewEmployee(actor, employee)` (`permissions.ts`) → `getEmployeeEvidence(actor, employeeId, period)` |
| `get_pending_evidence` | — | `getPendingEvidenceForManager(actor)` |
| `list_review_drafts` | — | `listReviewDraftsByManager(actor)` |
| `get_review_draft` | `{ draftId }` | `getReviewDraft` → `assertOwnsReviewDraft(actor, draft)` → return |
| `generate_review_draft` | `{ employeeId, period }` | scope assert as above → the same rate-limit gate the HTTP route uses (`src/server/rateLimit.ts`) → `orchestrateReviewGeneration(actor, employeeId, period)` (`src/server/agents/orchestrator.ts`) |

5. **Error handling**: catch `PermissionError` / `NotFoundError` (from `src/server/auth/permissions.ts`) and return them as MCP tool errors (`isError: true`) with the message only — never a stack, never env. Audit denials: `logAudit({ actorId: actor, action: "access_denied", metadata: { via: "mcp", tool } })`. Audit successful `generate_review_draft` as `review_draft_generated` with `metadata.via = "mcp"`.
6. **`generate_review_draft` dependency**: it calls the Python agent service via `src/server/agentClient.ts`, so `AGENT_SERVICE_URL` (and `AGENT_SHARED_SECRET` if the target sets one) must be present in the MCP server env. If unset, return a tool error explaining that, don't crash.

### Part 3 — tests

`tests/mcp-reviewops.test.ts` (vitest, alongside the existing 13 suites):
- Setup: temp sqlite via `DATABASE_URL`, schema push or programmatic migration consistent with how existing tests build the DB (check `tests/` setup helpers first and reuse them), `seedDatabase()` from `src/server/db/seed.ts`, then `issueToken("u_maria")`.
- Spawn the real server via the SDK `Client` + `StdioClientTransport` (command: tsx; make it **Windows-safe** — this repo is developed on Windows; prefer spawning `process.execPath` with tsx's CLI entry or verify `npx --no-install tsx` works) passing `REVIEWOPS_MCP_TOKEN` + `DATABASE_URL` in the child env.
- Assert: `list_direct_reports` returns exactly Anna/Mark/Julia (`u_anna`, `u_mark`, `u_julia`); `get_evidence_summary` for `u_olek` returns a tool error AND writes an `access_denied` audit row; `get_evidence_summary` for `u_anna` deep-equals a direct `getEmployeeEvidence("u_maria","u_anna")` call; a revoked token makes the server exit non-zero at startup.
- `afterAll`: close the transport, no orphaned child processes.
- Unit tests for `mcpTokenService`: only hashes stored, resolve→null after revoke and after expiry.
- Do NOT call `generate_review_draft` in tests (needs live Gemini) — it is verified manually.
- Definition of green: `npm test` (all suites), `npm run typecheck`, `npm run build`.

### Part 4 — docs (keep them honest, mind the writeup word budget)

- `README.md`: a short **"Use it from any MCP client"** subsection: issue a token in the UI as Maria → client config snippet (command `npm run mcp:reviewops`, `cwd` = repo root, env `REVIEWOPS_MCP_TOKEN`, optional `AGENT_SERVICE_URL`) → `npx @modelcontextprotocol/inspector npm run mcp:reviewops` for interactive inspection. Update the "Kaggle capstone concepts demonstrated" line: "mock MCP/connector boundary" → "MCP server exposing the app's tools (token-authenticated)". Extend the Security-model token bullet to mention MCP tokens (hash-only, revocable, identity never from request input).
- `docs/ARCHITECTURE.md`: new subsection — the MCP surface, the token identity model, why approve/export are excluded (HITL), and the **production path**: OAuth 2.1 over the streamable-HTTP transport, mapping the verified email to a user via `getUserByEmail`.
- `docs/KAGGLE_WRITEUP_DRAFT.md`: update the MCP row in the "Capstone key concepts" table and the "mock MCP/connector boundary" phrase in "Why this is an agent, not a chatbot". The writeup is ~1,900 of a hard 2,500-word limit — keep edits roughly word-neutral.
- `docs/DEMO_SCRIPT.md`: add an optional ~30s beat in the build scene: generate the token as Maria on camera, paste into MCP Inspector, call `list_direct_reports` then `get_evidence_summary` for Anna.

**Ground rules:** no API keys or secrets committed; comment the non-obvious decisions in code (identity from config not request, HITL exclusions, hash-only storage, why stdio); match existing code style (typed, zod-validated, small modules); don't modify `agent-service/`; existing app behavior unchanged (everything is additive).

**Definition of done:** all green (`npm test`, `npm run typecheck`, `npm run build`); manual flow works end-to-end: log in as Maria → generate MCP token → run MCP Inspector with the token → 8 tools listed → `list_direct_reports` returns three reports → `get_evidence_summary` for Olek is denied and shows up in the audit log → revoke the token → the server refuses to start.
