# ReviewOps Agent

A permission-aware, evidence-grounded assistant for engineering managers. It
helps managers generate targeted questionnaires for their direct reports,
collect employee-approved success evidence, validate evidence quality, and
generate interim or annual review drafts — always with human approval and never
sending raw employee data to the model.

> Kaggle AI Agents capstone — track: **Agents for Business**. All data is synthetic.
>
> **Architecture:** hybrid — a TypeScript **Next.js frontend** + a **Python ADK
> 2.0 agent service** (graph `Workflow`s, Gemini; requires an API key with
> credits). The agent brain lives in `agent-service/`; the app calls it over
> REST. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## The problem

Engineering managers prepare reviews from incomplete memory, scattered notes,
and last-minute evidence gathering. Early-year work is forgotten, recent events
are over-weighted, feedback turns vague, and sensitive data can leak into AI
prompts. The cost is concrete: hours per report reconstructing a year from
memory, reviews skewed toward whoever spoke up last quarter, and a compliance
incident every time a manager "fixes" it by pasting 1:1 notes into a public
chatbot.

## The solution

ReviewOps Agent gives employees a structured place to submit their own success
evidence all year, validates that evidence with an agent (asking follow-ups
when answers are vague), and grounds every claim in a manager's review draft in
evidence the employee approved. The decisions themselves — performance
assessment, compensation input, areas to develop — stay with the manager;
ReviewOps reinforces them with evidence, never makes them, and never sends raw
employee data to the model.

The review draft itself is computed from **every PII-filtered source
available** — the employee's self-assessment (survey answers and standalone
evidence), peer reviews, feedback, 1:1 notes, and goals — and **calibrated
against the role's expectations**: each claim is cited, and every expectation
in the role matrix is explicitly rated `at level`, `above level`, `developing
toward level`, or `not yet evidenced`. Expectations with no supporting signal
anywhere are never assumed met — the draft marks them and lists concrete
**requests for the missing information**, which the manager follows up on
(human-in-the-loop).

The core design decision: **access control, consent, and PII minimization run
in the TypeScript application _before_ the agent is ever called.** The LLM is
never the authorization boundary — earn the trust in code, then use the model.

## What makes it an agent (not a chat app)

It runs a structured, multi-step workflow with access control, tools, state,
privacy filtering, and human-in-the-loop approval:

1. Read team structure from a mock HRIS connector.
2. Enforce manager/direct-report permissions **before** any agent sees data.
3. Generate a questionnaire from a manager's topic, and safety-check it.
4. Create personal token links for employees.
5. Validate responses and ask follow-up questions when evidence is vague.
6. Turn answers into evidence cards mapped to values/goals/role expectations.
7. Draft a review **only** from consented, approved evidence — rating every
   role expectation and requesting details for the ones with no evidence.
8. Flag unsupported claims, vague feedback, recency bias, and sensitive data.
9. Require manager approval before export.

## Architecture

![ReviewOps Agent — system architecture](docs/diagrams/architecture-detailed.svg)

The **agent brain runs in the Python service** (`agent-service/`) as real ADK 2.0
graph `Workflow`s with Pydantic-typed I/O; the TS app calls it over REST via
`src/server/agentClient.ts` (`AGENT_SERVICE_URL`, **required**). Access control,
consent, and PII minimization happen in the **TS app before the REST call** — the
LLM is never the security boundary. (Unit tests mock the client; there is no
in-process agent fallback.) See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

### The three agent workflows

Each workflow chains LLM agents with deterministic nodes; I/O is structured
Pydantic throughout.

![The three ADK agent workflows](docs/diagrams/agent-workflows.svg)

### Deployment topology

![Deployment topology](docs/diagrams/deploy-topology.svg)

## Tech stack

**Frontend:** TypeScript · Next.js 16 (App Router) · React 19 · SQLite + Drizzle
ORM · Zod 4 · Vitest.
**Agent service:** Python 3.12 · **Google ADK 2.0** (`google-adk`) + `agents-cli`
· Gemini · FastAPI · OpenTelemetry.

## Setup

> **Full step-by-step local runbook (run frontend + agent service + click the
> whole flow): [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md).**

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
| `AGENT_SERVICE_URL` | _(required)_ | Python agent service URL — local dev: `http://127.0.0.1:8800` |
| `TOKEN_EXPIRY_HOURS` | `168` | survey link lifetime |

**Agent service (`agent-service/.env`):** `GOOGLE_API_KEY` (required),
`GEMINI_MODEL` (e.g. `gemini-2.5-flash`).

## Demo flow

1. Log in as **Maria** (Engineering Manager). The dashboard shows only her
   direct reports — Anna, Mark, Julia. **Olek is not visible** (different team).
2. Create a questionnaire. The generator is **manager-driven**: describe a topic
   for a short evidence survey, or paste a structure (a skill list + an L1–L5
   scale + opt-in sections) and it produces a per-skill matrix with dropdowns,
   sections, and a single rating-scale legend. The Safety Agent reviews it.
3. Not quite right? Use **Refine & regenerate** with free-text feedback to rebuild
   the draft in place. Approve → personal token links land in the **mock outbox**.
4. Open Anna's link and answer. A weak free-text answer ("I helped with frontend.")
   is flagged with a follow-up; improve and resubmit and the score rises.
5. Log in as **Anna** → **Add evidence** directly. A weak entry isn't saved until
   she **confirms** ("submit anyway for manager review"); strong evidence
   auto-approves. Low-confidence items go to Maria's **evidence review queue**
   (with the raw text quoted + the agent's concern).
6. Back as Maria, open **Results** / a report's **evidence on file**, then
   **Generate review draft**. Context is consent-gated + privacy-filtered, and
   grounded in self-evidence **plus connector signals** (peer reviews, feedback,
   1:1 notes). The Fairness check flags unsupported claims.
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
npm run e2e       # Playwright smoke vs a deployed instance (default: production)
```

`npm run e2e` runs a Playwright smoke against a **live deployment** (`E2E_BASE_URL`
overrides the default production URL): it logs in as Maria, asserts permission
scope (her reports show, another team's does not), and drives a real
questionnaire generation through **Vercel → Cloud Run → Gemini** to the preview.
It writes a draft to the target DB, so re-seed afterwards when run against the demo
DB.

**67 Vitest tests** (13 files) cover the security stories (manager scope, token hashing,
expiry, cross-assignment isolation), questionnaire schema validity,
sensitive-question rejection, the weak-answer follow-up loop, the consent gate,
review grounding (incl. connector signals), the dynamic-questionnaire
**normalizer invariants**, the survey-form logic + **RTL component tests**
(jsdom), the evidence **confirm-before-store / dedup / lock** flow, the deadline
**reminders/nudges**, and the **connector** contracts. Agent *behavior* is evaluated separately with
`agents-cli eval` (golden datasets + LLM-as-judge on Vertex; framework in
[docs/EVALUATION_PLAN.md](docs/EVALUATION_PLAN.md), **latest scores in
[docs/EVAL_RESULTS.md](docs/EVAL_RESULTS.md)** — questionnaire 4.67, evidence 5.00,
review 5.00) plus a no-GCP `agent-service/tests/eval/structural_smoke.py`.

## Limitations

- Mock login (no real SSO); cookie-based session.
- Mock HRIS + mock outbox, and a **mock** BambooHR/Lattice connector behind typed
  contracts (`src/server/connectors/`) — real adapters/MCP can swap in later.
- The app requires the running agent service (Gemini); unit tests mock the
  agent client.
- Single-manager direct-report scope (no skip-level / HR-admin flows).
- PII redaction is pattern-based and demonstrative.
- **Uneven flow maturity:** the questionnaire flow has real mileage (a real
  ~420-question skill-matrix survey ran through it); the interim/annual
  **review-draft flow** works end-to-end but has had less hands-on testing — a
  real-use hardening pass is the top roadmap item.

## Deployment

**Live demo: https://reviewops-agent.vercel.app** — log in as **Maria** and run the
full flow.

The **Python agent service is deployed to Cloud Run** (stateless; Vertex mode, no
API key in the image). The **Next.js frontend** is deployed to **Vercel** backed by
**Turso/libSQL** (the DB layer is dual-driver: better-sqlite3 locally + Turso in
prod).

To reproduce the deployment (**full steps: [docs/DEPLOY.md](docs/DEPLOY.md)**):

1. **Agent service → Cloud Run:** `gcloud run deploy reviewops-agent --source agent-service`
   with Vertex mode env vars and an `AGENT_SHARED_SECRET` (no API key in the image).
2. **Database → Turso:** `turso db create reviewops`, then `npx drizzle-kit push`
   and `npm run seed` pointed at the Turso URL.
3. **Frontend → Vercel:** import the repo, set `AGENT_SERVICE_URL`, the Turso
   vars, `SESSION_SECRET`, and the matching `AGENT_SHARED_SECRET`.

## Roadmap

Top of the queue: a **real-use hardening pass of the review flow** (verify role
expectations → info requests, self-assessment/feedback grounding, fairness
checks under real conditions) and an **MCP server surface** (mock OAuth 2.1;
ready-to-run prompt in [docs/PROMPT_MCP_SERVER.md](docs/PROMPT_MCP_SERVER.md)).
Then: Slack delivery; Cloud Scheduler for event-driven reminders; real
Lattice/BambooHR adapters; Notion/knowledge base for values, ladder, and role
expectations. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Kaggle capstone concepts demonstrated

Multi-agent orchestration (ADK 2.0 graph `Workflow`s) · dynamic manager-driven
generation · tool/service use + `SkillToolset` · **mock connector boundary**
(BambooHR/Lattice contracts, MCP-ready) · long-running business workflow · state & memory
(SQLite) · access control & RBAC · privacy/data minimization · confidence-gated
routing · human-in-the-loop approval · grounding & fairness checking ·
evaluation framework (`agents-cli eval`, LLM-as-judge, trajectory) · observability
(OpenTelemetry).

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the authoritative doc:
  hybrid architecture, agent-workflow graphs (Mermaid), data model, access
  control & token design, privacy pipeline, human-in-the-loop, testing, and how
  the Google 2026 *Security & Evaluation* and *Agent Skills* whitepapers are
  applied. **Start here.**
- **[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)** — local runbook: start both
  services and click the whole flow.
- [docs/DEPLOY.md](docs/DEPLOY.md) — reproduce the Cloud Run + Vercel + Turso
  deployment.
- [docs/EVALUATION_PLAN.md](docs/EVALUATION_PLAN.md) — evaluation framework;
  latest scores in [docs/EVAL_RESULTS.md](docs/EVAL_RESULTS.md).
- [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) — product definition, users,
  user stories.
- [docs/ROADMAP.md](docs/ROADMAP.md) — post-MVP integrations.
- [docs/PROMPT_MCP_SERVER.md](docs/PROMPT_MCP_SERVER.md) — ready-to-run
  implementation prompt for the queued **MCP server surface** (mock OAuth 2.1).
- [docs/KAGGLE_WRITEUP_DRAFT.md](docs/KAGGLE_WRITEUP_DRAFT.md) — the Kaggle
  writeup.
- [docs/diagrams/](docs/diagrams/) — rendered SVG diagrams.
- `docs/PROMPT_FOR_CODING_AGENT.md` — original scaffolding prompt (historical).

## Ethical positioning

ReviewOps Agent does **not** evaluate, rank, promote, or penalize employees
automatically, and does not decide compensation. It supports and reinforces the
manager's own decisions — performance assessment, compensation input, areas to
develop — with organized, consented evidence; the manager is always in control.
