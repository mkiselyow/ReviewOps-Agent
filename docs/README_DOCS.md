# ReviewOps Agent Documentation Pack

This folder contains TypeScript-updated documentation for building the ReviewOps Agent MVP.

## Files

- `PROJECT_SPEC.md` — product definition, scope, users, demo scenario, user stories.
- `ARCHITECTURE_AND_SECURITY.md` — TypeScript/Next.js architecture, data model, agents, tools, RBAC, token design, privacy pipeline.
- `PROMPT_FOR_CODING_AGENT.md` — copy-paste prompt for Codex/Claude/coding agent to scaffold and implement the project.
- `DEMO_SCRIPT.md` — video/demo walkthrough for Kaggle capstone.
- `EVALUATION_PLAN.md` — automated and manual evaluation plan.
- `ROADMAP.md` — future integrations and post-MVP improvements.
- `KAGGLE_WRITEUP_DRAFT.md` — starter writeup for Kaggle submission.

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
