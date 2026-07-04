# ReviewOps Agent — Demo Script (Kaggle video)

## Goal

Record the Kaggle capstone demo showing that ReviewOps Agent is not a generic
chat app: it is a permission-aware, evidence-grounded, human-approved workflow
agent for engineering managers.

**Video length: hard cap 5:00 (Kaggle limit). Target 4:30.** Practice each
scene against the time budget below; cut the optional beats first if over.

Rubric bullets this script covers: problem statement → why agents →
architecture (images) → demo → the build.

## Setup

**Record against the live deployment** — https://reviewops-agent.vercel.app —
it is simpler than the local stack and visibly proves deployability
(Vercel → Cloud Run → Gemini → Turso).

Before recording:

1. Re-seed the demo DB so state is clean (see [DEPLOY.md](DEPLOY.md) — e2e and
   earlier takes write drafts).
2. Have these images ready to show full-screen:
   `diagrams/cover.png`, `diagrams/architecture-detailed.svg`,
   `diagrams/agent-workflows.svg`, `diagrams/deploy-topology.svg`.
3. Optional (build scene): Antigravity IDE open on the repo with your real
   task history visible.

(Local-stack instructions live in [LOCAL_DEV.md](LOCAL_DEV.md) if you prefer
recording locally.)

## Scene 0 — The problem & why agents (0:30)

Narrate over `cover.png`:

> Engineering managers write performance reviews from memory: early-year work
> is forgotten, recent events dominate, feedback turns vague — and more and
> more, sensitive HR notes get pasted straight into a public chatbot.
> ReviewOps Agent fixes the workflow, not just the writing: employees submit
> evidence all year, agents validate and structure it, and review drafts are
> grounded in evidence the employee approved. Agents fit because this is a
> multi-step judgment task — generate, validate, follow up, check fairness —
> not a single completion.

## Scene 1 — Architecture (0:45)

Show `architecture-detailed.svg`, then `agent-workflows.svg`, then `deploy-topology.svg`:

> The design is a hybrid. The TypeScript app is the security boundary — access
> control, consent, and PII minimization run in code before the agent is ever
> called. The Python service is the agent brain: three ADK 2.0 graph
> workflows — questionnaire, evidence, review — each chaining Gemini agents
> with deterministic nodes. It's deployed for real: Next.js on Vercel, the
> agent service on Cloud Run in Vertex mode, Turso as the database — that's
> the app you're about to see.

## Scene 2 — Login and manager scope (0:40)

1. Open https://reviewops-agent.vercel.app, log in as `Maria — Engineering Manager`.
2. Show her direct reports (Anna, Mark, Julia); point out Olek is absent —
   he's on another team.
3. Optional: hit Olek's URL directly → `403 Access Denied`.

> Access control is enforced in code before data reaches the agent. The model
> never sees data the current user isn't allowed to see.

## Scene 3 — Generate a questionnaire (0:50)

1. `Create questionnaire` → topic:
   `Create a Q2 collaboration and ownership evidence survey for my direct reports. I want concrete examples, impact, and supporting artifacts.`
   → period `2026-Q2` → submit.
2. Show the generated questionnaire and the Safety Agent verdict.
3. **(Optional — only if under budget.)** Paste a skill list + L1–L5 scale in
   the notes of a second questionnaire; show the per-skill matrix with one
   shared rating legend. This is the most impressive beat but also the
   slowest — the writeup covers it either way.
4. `Refine & regenerate` with one line of feedback, then approve. Show the
   outbox for ~10 seconds: personal token links minted per report, one token =
   one assignment. Copy Anna's link.

> The manager describes the survey; the agent builds it, a safety agent
> reviews it, and nothing is sent until the manager approves.

## Scene 4 — Employee evidence: weak → strong (0:40)

1. Open Anna's link in a second tab. Submit the weak answer:
   `I helped with frontend.`
2. Show the Evidence Validator's follow-up asking for a concrete example.
3. Submit the improved answer:
   `I refactored the shared tooltip component and helped Mark integrate it in the billing screen. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123 and BUG-45.`
4. Show the resulting evidence card: summary, impact, mapped value, quality
   score, evidence ID.

> The agent raises evidence quality before it ever reaches the manager — and
> weak evidence is never silently stored. (One sentence, no demo: employees
> can also add standalone evidence; low-confidence items go to the manager's
> review queue instead of auto-approving.)

## Scene 5 — Review draft + fairness check (0:50)

1. Back as Maria: open the results view (response status, strong/weak counts,
   mapped values), then pick Anna.
2. Show **Evidence on file**, generate the `2026-Q2` draft. Note it is
   grounded in consent-gated self-evidence **plus connector signals** (peer
   reviews, feedback, 1:1 notes fetched transiently from the mock
   BambooHR/Lattice connector), cited as `[ev_…]` and `[peer:…]`.
3. Scroll to **Role-Expectation Coverage**: every expectation of Anna's role is
   rated (`at level` / `above level` / `developing toward level` /
   `not yet evidenced`), and the **Requests for More Information** section lists
   what to collect for the un-evidenced ones.
4. Show the Fairness & Grounding warnings — e.g. an unsupported-claim warning
   with a suggested evidence-backed replacement.

> The draft is computed from every PII-filtered source — self-assessment, peer
> reviews, feedback, 1:1 notes — and calibrated against the role matrix.
> Nothing without evidence is assumed: the draft asks for what's missing. And a
> second agent reviews the review before the manager ever approves it.

## Scene 6 — Approve and export (0:15)

Approve the draft, export the Markdown, flash the exported file.

> The final action is human-approved and auditable.

## Scene 7 — The build (0:30)

Screen: repo README or split of `agent-service/app/` + eval results.

> Built as three ADK 2.0 graph workflows with Pydantic-typed I/O; the review
> agent loads a drafting skill via SkillToolset. Behavior is graded with
> agents-cli eval — LLM-as-judge over golden datasets. That loop caught a real
> safety gap: protected-topic requests were silently laundered into an
> "approved" survey; a hard-refuse path took that case from 1 out of 5 to 5
> out of 5. Sixty-seven Vitest tests cover the security stories.

**Antigravity beat (15–20s, only if you can show real usage):** switch to the
Antigravity IDE with the project open and your genuine task history visible:

> Parts of the project were built and refactored with Google Antigravity —
> here's the actual task history.

Keep the claim proportional to real usage; do not overclaim.

Close over `cover.png`:

> ReviewOps: earn the trust in code, then use the model. Live demo and public
> repo linked below.

## After recording

1. Upload to YouTube as **Public** (not unlisted — safest for "no
   login/paywall"). Title: `ReviewOps Agent — Kaggle AI Agents Intensive Capstone`.
2. Description: live demo URL + GitHub URL.
3. Paste the YouTube URL into `KAGGLE_WRITEUP_DRAFT.md` (replacing the
   placeholder) and attach the video in the Kaggle Writeup media gallery.

## Time budget recap

| Scene | Budget |
|---|---|
| 0 Problem & why agents | 0:30 |
| 1 Architecture | 0:45 |
| 2 Login & scope | 0:40 |
| 3 Questionnaire | 0:50 |
| 4 Evidence weak→strong | 0:40 |
| 5 Draft + fairness | 0:50 |
| 6 Approve & export | 0:15 |
| 7 The build (+ Antigravity) | 0:30 |
| **Total** | **4:40** |
