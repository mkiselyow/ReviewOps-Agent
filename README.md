# ReviewOps Agent

A permission-aware, evidence-grounded assistant for engineering managers. It
helps managers generate targeted questionnaires for their direct reports,
collect employee-approved success evidence, validate evidence quality, and
generate interim or annual review drafts — always with human approval and never
sending raw HR data to the model.

> Kaggle AI Agents capstone — track: **Agents for Business**.
> All data is synthetic. The app runs fully offline with deterministic mock
> agents; configure a Gemini key to use real models via Google ADK.

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

## Agent architecture

```
Next.js UI / Route Handlers
  → Auth + RBAC + Permission filter   (TypeScript, before any model call)
  → Orchestrator
      ├─ Questionnaire Agent          generate 5–7 work-evidence questions
      ├─ Questionnaire Safety Agent   block sensitive / leading questions
      ├─ Evidence Validator Agent     score answers, request follow-ups
      ├─ Values Mapper Agent          map evidence → value / goal / expectation
      ├─ Privacy Filter Agent         minimize + redact PII (deterministic)
      ├─ Review Draft Agent           grounded Markdown draft (cites evidence)
      └─ Fairness & Grounding Agent   flag unsupported / vague / sensitive
  → Services (hris, survey, evidence, review, outbox, audit, export)
  → Tools (hris, survey, evidence, review, privacy)
  → SQLite (Drizzle) + local files + mock HRIS
```

Each agent has a Zod input/output schema and a **deterministic mock**. The
`modelProvider` calls Google ADK (`LlmAgent` + `Gemini`) when a key is
configured, validates the JSON against the schema, and falls back to the mock on
any error — so the app is always runnable. The Privacy Filter is intentionally
deterministic: data minimization is a security control and must never depend on
an LLM.

## Tech stack

TypeScript · Next.js 16 (App Router) · React 19 · SQLite + Drizzle ORM ·
Zod 4 · Google ADK for TypeScript (`@google/adk`) + Gemini (`@google/genai`) ·
Vitest.

## Setup

Requires Node.js 24+.

```bash
npm install
cp .env.example .env
npm run db:push     # create the SQLite schema
npm run seed        # load synthetic demo data
npm run dev         # http://localhost:3000
```

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/reviewops.sqlite` | SQLite location (`:memory:` for tests) |
| `GOOGLE_API_KEY` | _(empty)_ | Gemini key; optional |
| `USE_MOCK_MODEL` | `true` | `true` = always mock; `false` = use Gemini if key present |
| `GEMINI_MODEL` | `gemini-2.0-flash` | model id when a real model is used |
| `TOKEN_EXPIRY_HOURS` | `168` | survey link lifetime |

If `GOOGLE_API_KEY` is missing or `USE_MOCK_MODEL=true`, all agents use
deterministic mock outputs — no network required.

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
- Mock model outputs are heuristic, deterministic stand-ins, not human-quality
  prose.
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
