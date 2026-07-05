# ReviewOps Agent — Demo Script (Kaggle video)

## Goal

Record the Kaggle capstone demo showing that ReviewOps Agent is not a generic
chat app: it is a permission-aware, evidence-grounded, human-approved workflow
agent for engineering managers.

**Video length: hard cap 5:00 (Kaggle limit). Target 4:30.** Practice each
scene against the time budget below; cut the optional beats first if over.

Rubric bullets this script covers: problem statement → solution →
architecture + why agents (over the workflow diagrams) → demo → the build.

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

## Scene 0 — The problem & the solution (0:35)

Narrate over `cover.png`:

> Engineering managers write performance reviews from memory: early-year work
> is forgotten, recent events dominate, feedback turns vague. So managers do
> the obvious thing — dump a year of 1:1 notes, peer feedback, and chat
> threads into ChatGPT or NotebookLM to reconstruct the story. Understandable —
> and now the team's most sensitive data sits in a tool the company never
> vetted.
>
> ReviewOps fixes the workflow, not just the writing. Employees submit evidence
> all year, and the annual review draft is computed from every PII-filtered
> source available — self-assessment, peer reviews, feedback, 1:1 notes.
> Every claim cites evidence, every role expectation is rated, and gaps become
> requests for more information instead of assumed strengths. The decision
> stays with the manager — ReviewOps reinforces it with evidence.

## Scene 1 — Architecture & why agents (0:55)

Show `architecture-detailed.svg`:

> The design is a hybrid. The TypeScript app is the security boundary — access
> control, consent, and PII minimization run in code before the agent is ever
> called. The Python service is the agent brain.

Switch to `agent-workflows.svg` (the three workflow graphs on screen):

> And this is why it's agents, not one big prompt. The work is a chain of
> distinct judgment steps — build a questionnaire from the manager's structure,
> safety-check it, score each employee answer and ask a follow-up when it's
> weak, draft the review against the role matrix, then audit that draft for
> fairness. Each box you see is a separate agent or a deterministic check, so
> each can be tested and evaluated on its own. A single chat completion can't
> ask a follow-up question or veto its own output.

Switch to `deploy-topology.svg`:

> And it's deployed for real: Next.js on Vercel, the agent service on Cloud Run
> in Vertex mode, Turso as the database — that's the app you're about to see.

## Scene 2 — Login and manager scope (0:40)

1. Open https://reviewops-agent.vercel.app, log in as `Maria — Engineering Manager`.
2. Show her direct reports (Anna, Mark, Julia); point out Olek is absent —
   he's on another team.
3. Optional: hit Olek's URL directly → `403 Access Denied`.

> Access control is enforced in code before data reaches the agent. The model
> never sees data the current user isn't allowed to see.

## Scene 3 — Generate a one-question survey (0:45)

**Keep the survey to ONE question** — the demo's point is the agents working
at each step, not form-filling.

On screen:
1. `Create questionnaire` → topic:
   `One question only: ask each direct report for their single most impactful contribution this quarter — a concrete example, its impact, and a supporting link.`
   → period `2026-Q2` → submit.
2. When the preview appears, point at the single question + the Safety Agent
   verdict, then approve. Show the outbox (~5s), copy Anna's link.

Say aloud (over the generation spinner and preview):

> While this spins, three things are happening. The TypeScript app checked my
> permissions and called the Python agent service. There, the questionnaire
> agent turned my one-line intent into a structured plan; a separate safety
> agent reviewed it for sensitive or leading questions — its verdict is
> printed right here; and deterministic code, not the model, expanded the plan
> into the final form. Nothing is sent yet — I approve, and only then are
> personal token links minted; the server stores only a hash of each token.

## Scene 4 — Employee answers: weak → strong (0:40)

On screen:
1. Open Anna's link in a second tab. Answer the single question weakly:
   `I helped with frontend.` → submit.
2. The follow-up question appears. Answer it properly:
   `I refactored the shared tooltip component and helped Mark integrate it in the billing screen. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123 and BUG-45.`
3. Show the resulting evidence card: summary, impact, mapped value, quality
   score, evidence ID.

Say aloud:

> The link identifies Anna from the token — no login, no way to reach anyone
> else's survey. Behind this submit button, the evidence workflow runs: a
> security node redacts PII and strips prompt-injection attempts before the
> model sees anything; then the validator agent scores the answer — this one
> is too vague, so instead of storing it, it asks Anna for a concrete example.
> The improved answer scores high enough that deterministic routing
> auto-approves it into an evidence card, mapped to a company value. Weak
> answers below the confidence bar would land in Maria's review queue instead —
> nothing is ever silently stored.

## Scene 5 — Review draft + fairness check (0:50)

On screen:
1. Back as Maria: open results for the survey, then Anna's **review prep** —
   show **Evidence on file**.
2. Generate the `2026-Q2` draft. While it generates, keep talking (below).
3. When it renders: point at citations (`[ev_…]`, `[peer:…]`), scroll to
   **Role-Expectation Coverage** (each expectation rated `at level` /
   `above level` / `developing toward level` / `not yet evidenced`), then
   **Requests for More Information**, then the Fairness & Grounding warnings.

Say aloud (over generation):

> Now the real payoff. The app is assembling everything it's allowed to use:
> Anna's consented self-assessment, and — fetched transiently from the mock
> BambooHR-and-Lattice connector — peer reviews, feedback, and my 1:1 notes,
> plus her goals and the role expectations for her level. All of it passes a
> deterministic privacy filter before the agent sees a word. The draft agent —
> which loads a performance-review drafting skill — must cite an evidence id
> for every claim and rate every single role expectation. Look: the ones with
> no evidence anywhere aren't assumed — they're listed as requests for more
> information. And before I ever see it, a deterministic fairness check flagged
> this unsupported claim and suggested an evidence-backed replacement.

## Scene 6 — Approve and export (0:15)

On screen: approve the draft, export the Markdown, flash the exported file.

Say aloud:

> And the last step is mine, not the model's. Approval and export are human
> actions, and every sensitive step we just took — including anything denied —
> is in the audit log.

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
| 0 Problem & solution | 0:35 |
| 1 Architecture & why agents | 0:55 |
| 2 Login & scope | 0:40 |
| 3 One-question survey | 0:45 |
| 4 Evidence weak→strong | 0:40 |
| 5 Draft + fairness | 0:50 |
| 6 Approve & export | 0:15 |
| 7 The build (+ Antigravity) | 0:30 |
| **Total** | **4:50** |
