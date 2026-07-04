# Prompt: real MCP server at the connector boundary

> Implementation prompt for a coding agent (written for Google Antigravity).
> Goal: convert the "mock MCP/connector boundary" into a real MCP server +
> client without touching the deployed demo's default behavior.

---

## The prompt

You are working in the repo `ReviewOps-Agent` (Next.js 16 + TypeScript frontend in `src/`, Python ADK agent service in `agent-service/` — you will NOT touch the Python side). Read `docs/ARCHITECTURE.md` §3.1 and `src/server/connectors/` first.

**Context.** The app grounds performance-review drafts in "connector signals" (peer reviews, feedback, 1:1 notes, goals). Today these come from an in-process mock: `src/server/connectors/index.ts` defines `MockPerformanceConnector implements PerformanceConnector` (contract in `src/server/connectors/contracts.ts`, data in `src/server/connectors/mockData.ts`). The architecture was designed so a real API or **MCP server** can swap in behind the same interface. Your job is to implement that swap-in for the `PerformanceConnector` only (leave `DirectoryConnector` alone — it reads the app DB).

**Security invariant (do not violate).** The MCP server sits where a real Lattice/BambooHR API would: it is consumed by the **TypeScript service layer**, and everything it returns still flows through the existing privacy filter / PII minimization **before** any LLM call. Do NOT wire MCP tools into the Python agents, and do NOT bypass `gatherReviewSignals`.

**Task 1 — MCP server** (`src/mcp/hr-server.ts`):
- Use the official `@modelcontextprotocol/sdk` (add as a dependency) with the **stdio** transport.
- Server name `reviewops-hr`, version from package.json.
- Expose 4 tools whose input schemas (zod — already a dependency) mirror `PerformanceConnector`:
  - `get_peer_reviews` `{ employeeId: string, cycle?: string }` → `PeerReview[]`
  - `get_feedback` `{ employeeId: string, cycle?: string }` → `Feedback[]`
  - `get_one_on_ones` `{ managerId: string, employeeId: string, cycle?: string }` → `OneOnOneNote[]`
  - `get_goals` `{ employeeId: string, cycle?: string }` → `PerformanceGoal[]`
- Tool results: JSON in a `text` content block.
- Data source: import the arrays from `src/server/connectors/mockData.ts` and reuse the same filtering semantics as `MockPerformanceConnector` (including: feedback is dated, not cycle-tagged — cycle filter is a no-op there). Extract that filtering into a small shared module if needed so mock and server cannot drift.
- The server must be pure (no DB, no network, no env vars) and runnable standalone: add a package.json script `"mcp:hr": "tsx src/mcp/hr-server.ts"`.
- Give each tool a one-line description written for an MCP client (e.g. "Peer reviews for an employee, optionally filtered by cycle (e.g. 2026-Q2). Lattice-shaped.").

**Task 2 — MCP client connector** (`src/server/connectors/mcpPerformance.ts`):
- `McpPerformanceConnector implements PerformanceConnector` with `source = "mcp"`.
- Uses the SDK `Client` + `StdioClientTransport` that spawns the server via `tsx src/mcp/hr-server.ts` (resolve the command in a Windows-safe way — this repo is developed on Windows; prefer spawning `process.execPath` with tsx's CLI entry or `npx --no-install tsx`, and verify it actually works on Windows).
- Lazy singleton: connect on first call, reuse the session, expose a `close()` for tests.
- Each interface method calls the corresponding tool and parses/validates the JSON result with the zod schemas from Task 1 (share them from one module; never trust the wire blindly).

**Task 3 — provider selection** (`src/server/connectors/index.ts`):
- `CONNECTOR_MODE` env var: `"mock"` (default, current behavior) | `"mcp"`.
- Only the `performance` export switches; `directory` stays mock. Default MUST remain in-process mock so the deployed Vercel demo is completely unaffected.

**Task 4 — parity tests** (`tests/connectors-mcp.test.ts`):
- Vitest. Start the real MCP connector, and assert for a known seed employee (see `mockData.ts` for ids) that each of the 4 methods returns deep-equal results to `MockPerformanceConnector`, with and without a `cycle` filter.
- Also assert `gatherReviewSignals` output parity end-to-end with the MCP connector active.
- Clean up the child process in `afterAll`. The suite must pass on Windows and must not leak a hanging process. All existing tests must keep passing (`npm test`), plus `npm run typecheck` and `npm run build`.

**Task 5 — docs (keep them honest):**
- `README.md`: in "Limitations", replace the "mock BambooHR/Lattice connector … real adapters/MCP can swap in later" line with the new reality (real MCP server + stdio client, mock data behind it; `CONNECTOR_MODE=mcp` to enable); in "Kaggle capstone concepts demonstrated", change "mock MCP/connector boundary" to "MCP server + client at the connector boundary".
- `docs/ARCHITECTURE.md` §3.1: describe the MCP option (server file, tools, transport, provider switch).
- `docs/KAGGLE_WRITEUP_DRAFT.md`: update the "Connectors (the MCP boundary)" section and the "mock MCP/connector boundary" phrase in the key-concepts table/why-agent section to describe the real MCP server. **The writeup must stay under 2,500 words** — it is currently ~1,900; keep the edit roughly word-neutral.
- Mention in README's demo/testing area: `npx @modelcontextprotocol/inspector npm run mcp:hr` lets a judge inspect the tools interactively.

**Ground rules:** no API keys or secrets anywhere; comment the non-obvious decisions (why stdio, why the boundary stays in TS, why the default is mock) in code; match the existing code style (typed, zod-validated, small focused modules); do not modify `agent-service/`; do not change `MockPerformanceConnector` behavior.

**Definition of done:** `npm test` (all suites incl. the new parity tests), `npm run typecheck`, `npm run build` all green; `CONNECTOR_MODE=mcp npm run dev` produces a review draft whose connector signals are identical to mock mode; docs updated as above.
