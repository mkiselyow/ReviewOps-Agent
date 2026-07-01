# ReviewOps Agent — Kaggle Writeup Draft

## Project Summary

ReviewOps Agent is a permission-aware, evidence-grounded assistant for engineering managers. It helps managers generate targeted questionnaires for their direct reports, collect employee-approved success evidence, validate evidence quality, and generate grounded interim or annual review drafts.

The project focuses on a common business problem: performance reviews are often prepared from incomplete memory and scattered evidence. ReviewOps turns the process into a structured workflow with access control, privacy filtering, evidence validation, human approval, and fairness checks.

## Track

Agents for Business

## Problem

Engineering managers need to prepare performance reviews that are specific, fair, and grounded in evidence. In practice, relevant achievements are often scattered across self-reviews, manager notes, project artifacts, and team communication. This can lead to vague reviews, recency bias, unsupported claims, and excessive manual effort.

## Solution

ReviewOps Agent provides a workflow where:

1. A manager logs in.
2. The app loads direct reports from a mock HRIS connector.
3. The manager asks the agent to generate a questionnaire.
4. The questionnaire is safety-checked and manager-approved.
5. Personal token links are created for employees.
6. Employees submit success evidence.
7. The Evidence Validator Agent checks quality and asks follow-up questions.
8. Submitted answers become structured evidence cards.
9. The manager generates a review draft for one direct report.
10. The Fairness and Grounding Agent checks the draft before approval.
11. The manager exports the final Markdown review.

## Architecture

ReviewOps is a **hybrid**: a TypeScript **Next.js frontend** + a **Python ADK
2.0 agent service**. The agents are real ADK graph `Workflow`s (e.g.
`questionnaire → safety`, `security_node → evidence_validator → finalize`,
`review_draft → fairness`) with Pydantic-typed I/O, served over REST. The TS app
owns access control and consent and sends only authorized, minimized,
PII-redacted context to the service — the LLM is never the security boundary.
The service is scaffolded with Google's `agents-cli` (playground, eval, deploy
to Agent Runtime). See `ARCHITECTURE.md`.

The design deliberately applies two Google (May 2026) whitepapers:
- *Vibe Coding Agent Security and Evaluation* — 7-Pillar security, the
  evaluation framework, and OpenTelemetry observability.
- *Agent Skills* — `SKILL.md` + progressive disclosure via ADK `SkillToolset`,
  and skill evaluation (EDD, Read→Draft→Act graduation).

## Why this is agentic

ReviewOps is not just a chatbot. It coordinates a multi-step workflow across tools, state, permissions, and human approvals.

It demonstrates:

- multi-agent orchestration (ADK 2.0 graph `Workflow`s);
- tool-mediated data access; on-demand `SkillToolset` skills;
- **dynamic, manager-driven questionnaire generation** (per-item matrix, sections,
  opt-in gates, shared rating-scale legend, typed inputs) with a **deterministic
  output normalizer** enforcing invariants on the model output, plus
  refine-and-regenerate;
- evidence validation with **confidence-gated routing** + **confirm-before-store /
  dedup / lock** for self-submitted evidence;
- a **mock MCP/connector boundary** (BambooHR/Lattice-shaped contracts) whose peer
  reviews / feedback / 1:1 notes **transiently** ground review drafts;
- privacy filtering before model calls (pre-LLM security node);
- permission-aware data retrieval;
- human-in-the-loop approval (the whitepaper's "Vibe Diff" logic review);
- review grounding and fairness evaluation;
- observability (OpenTelemetry traces) and an applied evaluation framework
  (`agents-cli eval` golden datasets + LLM-as-judge);
- audit logging.

## Agents

### Orchestrator Agent

Routes workflow steps and coordinates specialized agents.

### Questionnaire Agent

Generates targeted questions based on manager topic, purpose, period, company values, and role expectations.

### Questionnaire Safety Agent

Checks generated questions for sensitive, leading, accusatory, or non-work-related wording.

### Evidence Validator Agent

Evaluates employee answers for specificity, impact, source support, and review usability.

### Values Mapper Agent

Maps evidence to company values, goals, and role expectations.

### Review Draft Agent

Generates review drafts from sanitized, approved evidence cards.

### Fairness and Grounding Agent

Flags unsupported claims, vague praise, vague criticism, recency bias, and sensitive data.

### Privacy Filter Agent

Minimizes and sanitizes context before any model call.

## Tools and Connectors

The MVP uses mock connectors for reproducibility and privacy, but behind
**typed, vendor-neutral contracts** so a real API or MCP server can swap in.

- Mock HRIS connector for employees, manager relationships, goals, and roles.
- **`src/server/connectors/`** — BambooHR-shaped `DirectoryConnector` + Lattice-
  shaped `PerformanceConnector` (peer reviews, feedback, 1:1 notes, goals) with a
  mock provider; `gatherReviewSignals` folds these into review grounding.
- Survey tools for questionnaires, assignments, tokens, and responses.
- Evidence tools for evidence cards, quality scores, and the confirm/dedup/lock flow.
- Review tools for draft generation, approval, and export.
- Privacy tools for context minimization and PII redaction.
- Audit tools for sensitive events.

Future work replaces the mock provider with a real Lattice/BambooHR adapter (or
MCP server) behind the same interface, and mock outbox with Slack.

## Security and Privacy

The project uses several safeguards:

- Direct-report permissions are enforced before model calls.
- Survey tokens are scoped to one assignment.
- Raw tokens are not stored.
- The model does not receive full HR profiles.
- Privacy filter removes unrelated personal data.
- Manager approval is required before exports.
- Audit log records sensitive actions.
- The app uses synthetic data only.

## Human-in-the-loop

ReviewOps does not make HR decisions. The system drafts and checks review content, but the manager remains responsible for approval and final judgment.

The system does not:

- rank employees;
- decide promotions;
- decide compensation;
- automatically send external messages;
- read private communications without explicit workflow.

## Demo Scenario

The demo shows a manager named Maria creating a Q2 collaboration and ownership survey for her direct reports. Anna submits a vague answer, the Evidence Validator asks for a more concrete example, and Anna improves the evidence. Maria then generates a review draft for Anna, and the Fairness and Grounding Agent flags unsupported claims before the manager approves the final Markdown export.

## Evaluation

**50 Vitest tests** cover the TS app (access control, token security, consent
gate, questionnaire normalizer invariants, survey-form logic + RTL component
tests, evidence confirm/dedup/lock, connector contracts + review grounding). The
Python agents are evaluated with **`agents-cli eval`**: golden datasets for all
three workflows (`reviewops-questionnaire/evidence/review.json`) scored by
**LLM-as-judge** rubrics (`questionnaire_quality`, `evidence_quality`,
`review_quality`) + a trajectory metric, with a no-GCP `structural_smoke.py` for
deterministic structural checks against the live service. (Running the LLM-judge
suites needs Vertex AI Eval Service + GCS.) The framework applies the *Vibe Coding
Agent Security and Evaluation* dimensions: intent satisfaction, functional
correctness, trajectory quality, safety, and cost — with Read→Draft→Act
graduation and `pass^k` for the auto-approve evidence path.

The suites were **run on Vertex** and earned their keep: baseline scores were
evidence 5.0 / review 5.0 / questionnaire 4.43, and the questionnaire run exposed
a genuine safety gap — a request dominated by protected topics was silently
substituted with safe questions and reported "approved." We fixed it with a
**hard-refuse** path (refuse + `needs_revision` + reason, never a laundered
"all-clear") and re-verified via `agents-cli eval compare`: that case went 1/5 →
5/5 and the suite mean rose to 5.00.

## Limitations

The MVP uses synthetic data and mock connectors. It does not integrate with real Lattice, BambooHR, Slack, email, or SSO. It does not handle compensation or promotion decisions. It is not a production HR system.

## Future Work

- Slack delivery for questionnaire links and reminders.
- Lattice/BambooHR adapters.
- Notion connector for company values and role expectations.
- Employee portal for ongoing evidence journal.
- Recurring quarterly review workflows.
- Stronger privacy, retention, and tenant-isolation controls.
- Observability dashboard for agent traces and evaluation results.
