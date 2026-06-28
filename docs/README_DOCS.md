# ReviewOps Agent Documentation Pack

Documentation for the ReviewOps Agent.

> **Architecture update:** the project is now a **hybrid** — a TypeScript
> Next.js frontend + a **Python ADK 2.0 agent service**. See **`ARCHITECTURE.md`**
> (authoritative, with diagrams). It now also contains the full data model,
> access control, token design, privacy pipeline, HITL, and testing detail
> (merged from the retired `ARCHITECTURE_AND_SECURITY.md`).

## Files

- **`ARCHITECTURE.md`** — current hybrid architecture, agent-workflow graphs
  (Mermaid diagrams), data flow, tools, data model (§5), access control/tokens
  (§6), privacy pipeline (§7), HITL (§8), testing (§9), and how the Google 2026
  *Security & Evaluation* and *Agent Skills* whitepapers are applied. **Start here.**
- **`LOCAL_DEV.md`** — local dev runbook: start the frontend + agent service and
  click the whole flow. **Read this to run the project.**
- `PROJECT_SPEC.md` — product definition, scope, users, demo scenario, user stories.
- `PROMPT_FOR_CODING_AGENT.md` — original scaffolding prompt (TS MVP, historical).
- `DEMO_SCRIPT.md` — video/demo walkthrough for Kaggle capstone.
- `EVALUATION_PLAN.md` — evaluation plan (to be refreshed to the 7-dimension
  framework + agents-cli eval / LLM-as-judge / trajectory inspection).
- `ROADMAP.md` — future integrations and post-MVP improvements.
- `KAGGLE_WRITEUP_DRAFT.md` — starter writeup for Kaggle submission.

## Applied frameworks (Google, May 2026)
- *Vibe Coding Agent Security and Evaluation* — 7-Pillar security, evaluation
  dimensions/methods, OpenTelemetry observability.
- *Agent Skills* — SKILL.md + progressive disclosure, ADK `SkillToolset`, skill
  evaluation (EDD, Read/Draft/Act graduation).
See the "Frameworks applied" section of `ARCHITECTURE.md`.

## Architecture choice

The docs are updated for:

- TypeScript
- Node.js
- Next.js App Router
- SQLite
- Drizzle or Prisma
- Google ADK for TypeScript where practical
- deterministic mock model fallback

## MVP questionnaire delivery choice

The MVP uses **personal token links** for survey respondents.

Slack delivery is intentionally left as a roadmap item.

## Security stance

- No real HR data.
- No automatic HR decisions.
- No employee ranking.
- No prompt-based access control.
- Permission filtering before model calls.
- Personal-data minimization before model calls.
- Human approval before sensitive outputs.
