# ReviewOps Agent

A permission-aware, evidence-grounded assistant for engineering managers. It
helps managers generate targeted questionnaires for their direct reports,
collect employee-approved success evidence, validate evidence quality, and
generate interim or annual review drafts — always with human approval and never
sending raw HR data to the model.

> Kaggle AI Agents capstone — track: **Agents for Business**. All data is synthetic.
>
> **Architecture:** hybrid — a TypeScript **Next.js frontend** + a **Python ADK
> 2.0 agent service** (graph `Workflow`s, Gemini; requires an API key with
> credits). The agent brain lives in `agent-service/`; the app calls it over
> REST. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Business problem

Engineering managers prepare reviews from incomplete memory, scattered notes,
and last-minute evidence gathering. Early-year work is forgotten, recent events
are over-weighted, feedback turns vague, and sensitive data can leak into AI
prompts. ReviewOps Agent gives employees a structured place to submit their own
evidence, validates that evidence, and grounds every review claim in approved
evidence — without making any HR decision automatically.

## What makes it an agent (not a chat app)

It runs a structured, multi-step workflow with access control, tools, state,
privacy filtering, and human-in-the-loop approval:

1. Read team structure from a mock HRIS connector.
2. Enforce manager/direct-report permissions **before** any agent sees data.
3. Generate a questionnaire from a manager's topic, and safety-check it.
4. Create personal token links for employees.
5. Validate responses and ask follow-up questions when evidence is vague.
6. Turn answers into evidence cards mapped to values/goals/role expectations.
7. Draft a review **only** from consented, approved evidence.
8. Flag unsupported claims, vague feedback, recency bias, and sensitive data.
9. Require manager approval before export.

## Agent architecture (hybrid)

```
Next.js app (TypeScript)                Python ADK 2.0 agent service (FastAPI)
  UI / Route handlers                     graph Workflows:
  → Auth + RBAC + permissions               questionnaire → safety
    (before any model call)                 security → validator → finalize (route)
  → Orchestrator ── REST ──▶               privacy → review_draft → fairness
    (agentClient)                         + Gemini (API key); OpenTelemetry
  → Services + privacy filter
  → SQLite (Drizzle) + mock HRIS
```

The **agent brain runs in the Python service** (`agent-service/`) as real ADK 2.0
graph `Workflow`s with Pydantic-typed I/O; the TS app calls it over REST via
`src/server/agentClient.ts` when `AGENT_SERVICE_URL` is set. Access control,
consent, and PII minimization happen in the **TS app before the REST call** — the
LLM is never the security boundary. (When `AGENT_SERVICE_URL` is unset, the app
falls back to the in-process TS agents, used by the offline unit tests.) See
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Tech stack

**Frontend:** TypeScript · Next.js 16 (App Router) · React 19 · SQLite + Drizzle
ORM · Zod 4 · Vitest.
**Agent service:** Python 3.12 · **Google ADK 2.0** (`google-adk`) + `agents-cli`
· Gemini · FastAPI · OpenTelemetry.

## Setup

Requires Node.js 24+ and (for the agent service) Python 3.11–3.13 + [uv](https://docs.astral.sh/uv/).

**1) Agent service** (Python ADK 2.0) — needs a Gemini API key with credits:
```bash
uv tool install google-agents-cli
cd agent-service
echo "GOOGLE_API_KEY=...your key..." > .env   # + GEMINI_MODEL=gemini-2.5-flash
agents-cli install
uvicorn app.local_server:app --port 8800       # local REST server
```

**2) Frontend** (Next.js), in another terminal:
```bash
npm install
cp .env.example .env            # set AGENT_SERVICE_URL=http://127.0.0.1:8800
npm run db:push                 # create the SQLite schema
npm run seed                    # load synthetic demo data
npm run dev                     # http://localhost:3000
```

## Environment variables

**Frontend (`.env`):**

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/reviewops.sqlite` | SQLite location (`:memory:` for tests) |
| `AGENT_SERVICE_URL` | _(empty)_ | Python service URL. Unset → in-process TS-agent fallback (tests) |
| `TOKEN_EXPIRY_HOURS` | `168` | survey link lifetime |

**Agent service (`agent-service/.env`):** `GOOGLE_API_KEY` (required),
`GEMINI_MODEL` (e.g. `gemini-2.5-flash`).

## Demo flow

1. Log in as **Maria** (Engineering Manager). The dashboard shows only her
   direct reports — Anna, Mark, Julia. **Olek is not visible** (different team).
2. Create a questionnaire (e.g. "Q2 collaboration and ownership"). The
   Questionnaire Agent proposes 5–7 questions; the Safety Agent reviews them.
3. Approve → personal token links are generated into the **mock outbox**.
4. Open Anna's link and submit a weak answer ("I helped with frontend.") — the
   Evidence Validator flags it and asks for a concrete example, impact, and a
   link. Improve the answer and resubmit; the score rises.
5. Back as Maria, open **Results** to see status, evidence quality, weak-evidence
   warnings, and mapped values.
6. **Generate review draft** for Anna. Context is consent-gated and
   privacy-filtered before the model. The Fairness & Grounding Agent flags any
   unsupported claims.
7. Approve and **export** the Markdown to `data/exports/`.

## Security model

- **Access control in code, before the model.** `canManagerViewEmployee` and the
  service-layer assertions run in TypeScript; the LLM is never trusted for
  authorization. Outside-team access returns `403`, unauthenticated `401`.
- **Token design.** Survey links use `crypto` random tokens; only the SHA-256
  **hash** is stored. A token maps to exactly one assignment, has an expiry and
  a revoked state, and cannot reach manager results. Respondent identity is
  derived from the token, never from request input.
- **Consent gate.** Evidence inherits the response's visibility; only evidence
  the employee marked `allow_for_review` can ground a review draft.
- **Privacy pipeline.** Raw context → permission filter → minimization → PII
  redaction → evidence-card normalization → model. The privacy filter logs the
  **categories** removed, never the values.
- **Human-in-the-loop.** Approval is required before sending questionnaires,
  generating drafts, approving drafts, and exporting.
- **Audit log.** Sensitive actions — including denied access — are recorded.

## Testing

```bash
npm test          # Vitest (in-memory SQLite + Drizzle migrations)
npm run typecheck # tsc --noEmit
npm run build     # Next production build
```

Tests cover the security stories (manager scope, token hashing, expiry,
cross-assignment isolation), questionnaire schema validity, sensitive-question
rejection, the weak-answer follow-up loop, the consent gate, and review
grounding (including UUID citations).

## Limitations

- Mock login (no real SSO); cookie-based session.
- Mock HRIS, mock outbox (no real Slack/email/Lattice/BambooHR).
- The offline TS-agent fallback (used by tests) is heuristic; the live agent
  service uses Gemini.
- Single-manager direct-report scope (no skip-level / HR-admin flows).
- PII redaction is pattern-based and demonstrative.

## Roadmap

Slack delivery and reminders; real Lattice/BambooHR adapters; Notion/knowledge
base for values, ladder, and role expectations; richer evidence sources. See
[docs/ROADMAP.md](docs/ROADMAP.md).

## Kaggle capstone concepts demonstrated

Multi-agent orchestration · tool/service use · long-running business workflow ·
state & memory (SQLite) · access control & RBAC · privacy/data minimization ·
human-in-the-loop approval · grounding & fairness checking · graceful model
fallback.

## Documentation

Full specs live in [`docs/`](docs/): product spec, architecture & security,
demo script, evaluation plan, roadmap, and the Kaggle writeup draft.

## Ethical positioning

ReviewOps Agent does **not** evaluate, rank, promote, or penalize employees
automatically. It helps managers collect and organize evidence and draft better,
fairer, evidence-grounded reviews — with the manager always in control.
