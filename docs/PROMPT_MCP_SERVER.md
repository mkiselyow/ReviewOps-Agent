# Prompt: expose ReviewOps as an MCP server (mock OAuth 2.1)

> Implementation prompt for a coding agent (Gemini CLI, Claude Code, or similar).
> Goal: any MCP client (MCP Inspector, Claude Desktop, Gemini CLI) can connect
> to ReviewOps' own MCP endpoint over streamable HTTP, authenticate through a
> **mock OAuth 2.1 flow** (demo/MVP: sign in as Maria), and query a manager's
> evidence, questionnaire status, and generate review drafts — with the app's
> existing RBAC still enforced in code. Real OAuth (a real IdP) is a roadmap
> item after this lands.

---

## The prompt

You are working in the repo `ReviewOpsAgent` (Next.js 16 + TypeScript frontend in `src/`, Python ADK agent service in `agent-service/` — you will NOT touch the Python side). Read `docs/ARCHITECTURE.md` and skim `src/server/services/` and `src/server/auth/` before writing code.

**Context.** ReviewOps grounds performance reviews in consented evidence. The TS app is the security boundary: services in `src/server/services/` take an explicit `managerId` and trust the caller to have enforced permissions first — route handlers gate every call via the predicates in `src/server/auth/permissions.ts` and `src/server/auth/rbac.ts`. You will add a second entry surface: an **MCP server endpoint** inside the Next.js app, protected by a **mock OAuth 2.1 authorization flow**, replicating exactly the same gating. Note: `src/server/auth/mockSession.ts` and `src/server/http.ts` are Next-bound (cookies/NextResponse) — your MCP/OAuth route handlers live in Next, so importing them is allowed where useful, but MCP identity comes from the bearer token, NOT from the session cookie.

**Security invariants (do not violate):**
- MCP identity comes only from the OAuth bearer token — never from a tool parameter, never from the LLM, never from the session cookie.
- **Only `isTestUser` accounts can authenticate via the mock OAuth flow, and only managers can use the MCP surface.** For the MVP the authorize page offers exactly **Maria** (`u_maria`). Enforce `isTestUser && isManager` server-side at token issuance AND again on every MCP request — never expose data of non-test users through this surface (their data is additionally protected by the scope asserts, but gate at auth anyway).
- Approval and export are deliberately **excluded** from the MCP tool surface — human-in-the-loop stays in the UI.
- Every scoped call re-asserts permissions with the existing predicates; denials are audited.
- Stay stateless: no new DB tables. Codes and access tokens are short-lived HMAC-signed payloads (sign with `SESSION_SECRET`, same pattern as the session cookie in `mockSession.ts`).

### Part 1 — mock OAuth 2.1 authorization server (inside the Next app)

Implement the minimal set an MCP client needs (MCP auth spec = OAuth 2.1 authorization-code + PKCE against a discoverable AS):

1. **Discovery metadata**:
   - `/.well-known/oauth-protected-resource` — points at this app as the AS for the `/api/mcp` resource (RFC 9728).
   - `/.well-known/oauth-authorization-server` — issuer, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code"]`.
2. **`/api/oauth/register`** (Dynamic Client Registration, RFC 7591): accept-all mock — validate `redirect_uris` present, return a generated `client_id` (no secret; public client + PKCE). Stateless: the client_id can be a signed blob embedding the redirect_uris so the authorize endpoint can verify them without storage.
3. **`/api/oauth/authorize`** (GET): render a minimal demo consent page — "ReviewOps demo sign-in" with a **Continue as Maria (Engineering Manager)** button. Validate `client_id`, `redirect_uri` (must match registration), `state`, `code_challenge` (+ `method=S256`). On click: issue a **code** = HMAC-signed payload `{ userId: "u_maria", clientId, codeChallenge, exp: now+60s }`, redirect to `redirect_uri?code=...&state=...`. Server-side check before issuing: the chosen user exists, `isTestUser === true`, `isManager(userId)` — refuse otherwise.
4. **`/api/oauth/token`** (POST): `authorization_code` grant. Verify the code's signature + expiry + `code_verifier` against the embedded challenge (S256). Issue an **access token** = HMAC-signed payload `{ userId, exp: now + 1h }`, `token_type: "Bearer"`, `expires_in`. No refresh tokens (MVP).
5. Put the signing/verification helpers in `src/server/auth/mcpOAuth.ts` with unit-testable pure functions (sign/verify/expiry). Reuse the HMAC approach from `mockSession.ts` (constant-time compare included).
6. Audit: log a `login` audit entry with `metadata.via = "mcp_oauth"` on successful token issuance.

### Part 2 — the MCP endpoint

1. **`/api/mcp`** (streamable HTTP transport, stateless mode — this must run on Vercel serverless). Preferred: Vercel's official **`mcp-handler`** npm package (`createMcpHandler`, and its auth wrapper if it fits) — verify it supports Next 16; otherwise use `@modelcontextprotocol/sdk`'s streamable-HTTP server transport adapted to a route handler. Server name `reviewops`.
2. **Auth on every request**: extract the `Authorization: Bearer` token, verify signature + expiry, load the user, re-check `isTestUser && isManager`. 401 with the RFC 9728 `WWW-Authenticate` header (pointing at the protected-resource metadata) when missing/invalid — that header is what triggers the client's OAuth flow. The acting `managerId` for all tools is the token's `userId`.
3. **Tools** (zod input schemas; results as JSON in a `text` content block; one-line descriptions written for an MCP client):

| Tool | Input | Backing calls (in order) |
|---|---|---|
| `list_direct_reports` | — | `getDirectReports(actor)` (`hrisService`) |
| `list_questionnaires` | — | `listQuestionnairesByManager(actor)` (`surveyService`) |
| `get_questionnaire_results` | `{ questionnaireId }` | `getQuestionnaire` → `assertOwnsQuestionnaire(actor, q)` (`rbac.ts`) → `getQuestionnaireResults(actor, id)` |
| `get_evidence_summary` | `{ employeeId, period? }` | `getEmployeeProfile` → `assertManagerCanViewEmployee(actor, employee)` (`permissions.ts`) → `getEmployeeEvidence(actor, employeeId, period)` |
| `get_pending_evidence` | — | `getPendingEvidenceForManager(actor)` |
| `list_review_drafts` | — | `listReviewDraftsByManager(actor)` |
| `get_review_draft` | `{ draftId }` | `getReviewDraft` → `assertOwnsReviewDraft(actor, draft)` → return |
| `generate_review_draft` | `{ employeeId, period }` | scope assert as above → the same rate-limit gate the HTTP routes use (`src/server/rateLimit.ts`) → `orchestrateReviewGeneration(actor, employeeId, period)` (`src/server/agents/orchestrator.ts`) |

4. **Error handling**: catch `PermissionError` / `NotFoundError` (from `src/server/auth/permissions.ts`) and return them as MCP tool errors (`isError: true`) with the message only — never a stack, never the token. Audit denials: `logAudit({ actorId: actor, action: "access_denied", metadata: { via: "mcp", tool } })`. Audit successful `generate_review_draft` as `review_draft_generated` with `metadata.via = "mcp"`.
5. **`generate_review_draft` dependency**: it calls the Python agent service via `src/server/agentClient.ts` (`AGENT_SERVICE_URL`, already configured locally and on Vercel). If unset, return a tool error explaining that; don't crash. Mind that Vercel Hobby caps the route at 60s — a normal draft (~10s) fits.

### Part 3 — tests

Add alongside the existing 13 vitest suites (check `tests/` setup helpers and reuse their DB bootstrapping):
- `mcpOAuth` unit tests: sign/verify round-trip; expired code rejected; wrong `code_verifier` rejected (S256); token expiry enforced; tampered signature rejected.
- Auth-gate tests: a token for a non-`isTestUser` user (craft one directly with the signing helper) is rejected by the MCP endpoint; a non-manager test user is rejected; missing bearer → 401 with `WWW-Authenticate`.
- Tool tests: invoke the route handler (or handler-level functions) with a valid Maria token on a seeded in-memory/temp DB — `list_direct_reports` returns exactly `u_anna`, `u_mark`, `u_julia`; `get_evidence_summary` for `u_olek` → tool error + an `access_denied` audit row; `get_evidence_summary` for `u_anna` deep-equals a direct `getEmployeeEvidence("u_maria","u_anna")` call.
- Do NOT call `generate_review_draft` in tests (needs live Gemini) — manual verification.
- Definition of green: `npm test` (all suites), `npm run typecheck`, `npm run build`.

### Part 4 — docs (keep them honest, mind the writeup word budget)

- `README.md`: a short **"Use it from any MCP client"** subsection: connect MCP Inspector (`npx @modelcontextprotocol/inspector`) to `http://localhost:3000/api/mcp` (or the live `https://reviewops-agent.vercel.app/api/mcp`), complete the OAuth popup as Maria, call tools. Update the "Kaggle capstone concepts demonstrated" line: "mock MCP/connector boundary" → "MCP server (streamable HTTP + OAuth 2.1 flow) exposing the app's tools". Note in the Security model that MCP identity comes from the OAuth token, demo-gated to `isTestUser` managers.
- `docs/ARCHITECTURE.md`: new subsection — the MCP surface, the mock OAuth 2.1 design (PKCE, stateless signed codes/tokens, `isTestUser` gate), why approve/export are excluded (HITL), and the **production path: replace the mock AS with a real IdP/SSO** (verified email → `getUserByEmail`).
- `docs/ROADMAP.md`: add a post-MCP item — "Real OAuth 2.1 / SSO for the MCP surface (replace the mock authorization server with a real IdP; per-user consent screens; refresh tokens)".
- `docs/KAGGLE_WRITEUP_DRAFT.md`: update the MCP row in the "Capstone key concepts" table and the "mock MCP/connector boundary" phrase in "Why this is an agent, not a chatbot". The writeup is ~1,900 of a hard 2,500-word limit — keep edits roughly word-neutral.
- Optional demo beat for any future video: connect MCP Inspector to the live URL on camera, OAuth "Continue as Maria", call `list_direct_reports` then `get_evidence_summary` for Anna.

**Ground rules:** no API keys or secrets committed (`SESSION_SECRET` stays env-only); comment the non-obvious decisions in code (identity from bearer not session/params, `isTestUser` gate rationale, HITL exclusions, stateless signed tokens); match existing code style (typed, zod-validated, small modules); don't modify `agent-service/`; existing app behavior unchanged (everything is additive).

**Definition of done:** all green (`npm test`, `npm run typecheck`, `npm run build`); manual flow works end-to-end: MCP Inspector → connect to `/api/mcp` → 401 triggers OAuth → register/authorize → "Continue as Maria" → 8 tools listed → `list_direct_reports` returns three reports → `get_evidence_summary` for Olek is denied and shows up in the audit log → a hand-crafted token for a non-test user is rejected. Stretch: repeat the same flow against the deployed Vercel URL.
