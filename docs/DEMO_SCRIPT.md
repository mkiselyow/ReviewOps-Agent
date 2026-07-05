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

> Managers write performance reviews from memory. Early work is forgotten.
> Recent events get too much weight. Feedback turns vague. So managers do the
> obvious thing. They paste a year of 1:1 notes and feedback into ChatGPT or
> NotebookLM. Understandable. But now sensitive team data sits in a tool the
> company never approved.
>
> ReviewOps fixes the workflow itself. Employees submit evidence all year.
> The review draft uses every allowed source: self-assessment, peer reviews,
> feedback, 1:1 notes. All of it is PII-filtered first. Every claim cites
> evidence. Every role expectation gets a rating. Missing evidence becomes a
> request, not a guess. And the decision stays with the manager. ReviewOps
> backs it with evidence.

## Scene 1 — Architecture & why agents (0:55)

Show `architecture-detailed.svg`:

> The design has two parts. The TypeScript app is the security boundary.
> Access control, consent, and PII filtering run in code. Only then is the
> agent called. The Python service is the agent brain.

Switch to `agent-workflows.svg` (the three workflow graphs on screen):

> And this is why agents, not one big prompt. The work is a chain of steps.
> Build the questionnaire. Safety-check it. Score each answer. Ask a follow-up
> when an answer is weak. Draft the review against the role matrix. Then check
> the draft for fairness. Each box here is a separate agent or a code check.
> So each step can be tested on its own. A single chat completion can't ask a
> follow-up. And it can't veto its own output.

Switch to `deploy-topology.svg`:

> And it runs live. Next.js on Vercel. The agent service on Cloud Run. Turso
> as the database. This is the app you are about to see.

## Scene 2 — Login and manager scope (0:40)

1. Open https://reviewops-agent.vercel.app, log in as `Maria — Engineering Manager`.
2. Show her direct reports (Anna, Mark, Julia); point out Olek is absent —
   he's on another team.
3. Optional: hit Olek's URL directly → `403 Access Denied`.

> Permissions are checked in code, before the agent. The model never sees data
> this user is not allowed to see.

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

> While this spins, three things happen. The app checks my permissions and
> calls the agent service. The questionnaire agent turns my request into a
> plan. A separate safety agent reviews the questions. Its verdict shows right
> here. Then plain code, not the model, builds the final form. Nothing is sent
> yet. I approve first. Only then are the personal links created. The server
> stores only a hash of each token.

## Scene 4 — Employee answers: weak → strong (0:40)

On screen:
1. Open Anna's link in a second tab. Answer the single question weakly:
   `I helped with frontend.` → submit.
2. The follow-up question appears. Answer it properly:
   `I refactored the shared tooltip component and helped Mark integrate it in the billing screen. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123 and BUG-45.`
3. Show the resulting evidence card: summary, impact, mapped value, quality
   score, evidence ID.

Say aloud:

> The link knows it's Anna from the token. No login. No way to open anyone
> else's survey. On submit, the evidence workflow runs. A security node
> removes PII and blocks prompt injection first. Then the validator agent
> scores the answer. This one is too vague. So it is not stored. Anna gets a
> follow-up question instead. Her better answer scores high. It becomes an
> evidence card, mapped to a company value. Low-scoring answers would go to
> Maria's review queue. Nothing is ever stored silently.

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

> Now the main part. The app collects everything it is allowed to use.
> Anna's approved self-assessment. Peer reviews, feedback, and my 1:1 notes
> from the mock HR connector. Her goals. The expectations for her role. All
> of it passes the privacy filter first. Then the draft agent writes the
> review. It loads a drafting skill for this. Every claim must cite an
> evidence id. Every role expectation gets a rating. See these gaps? No
> evidence means no guess. They become requests for more information. And a
> fairness check runs before I even see the draft. Here it flagged an
> unsupported claim and suggested a fix.

## Scene 6 — Approve and export (0:15)

On screen: approve the draft, export the Markdown, flash the exported file.

Say aloud:

> The last step is mine, not the model's. I approve and I export. And every
> sensitive action is in the audit log. Even the denied ones.

## Scene 7 — The build (0:30)

Screen: repo README or split of `agent-service/app/` + eval results.

> The build: three ADK graph workflows, all with typed input and output. The
> review agent loads a skill through SkillToolset. I grade the agents with
> agents-cli eval. An LLM judge scores them on golden datasets. That loop
> caught a real safety gap. Requests about protected topics were quietly
> replaced and marked approved. I added a hard-refuse path. That case went
> from one out of five to five out of five. And sixty-seven tests cover the
> security stories.

**Antigravity beat (15–20s, only if you can show real usage):** switch to the
Antigravity IDE with the project open and your genuine task history visible:

> Parts of this project were built with Google Antigravity. Here is the real
> task history.

Keep the claim proportional to real usage; do not overclaim.

Close over `cover.png`:

> ReviewOps: earn the trust in code, then use the model. The live demo and the
> repo are linked below.

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
