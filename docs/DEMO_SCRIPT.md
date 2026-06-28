# ReviewOps Agent — Demo Script

## Goal

Record a short Kaggle capstone demo showing that ReviewOps Agent is not a generic chat app. It is a permission-aware, evidence-grounded, human-approved workflow agent for engineering managers.

Target video length: 3–6 minutes.

## Demo Setup

This is a **hybrid** app: the Next.js frontend + the Python ADK 2.0 agent
service must both be running (the agent service needs a Gemini API key — no
offline mock).

```bash
# 1) Agent service (Python ADK 2.0)
cd agent-service
# put GOOGLE_API_KEY in agent-service/.env
agents-cli install
agents-cli playground          # or: agents-cli run "<prompt>"

# 2) Frontend (TypeScript Next.js), in a second terminal
cd ..
npm install
cp .env.example .env            # set AGENT_SERVICE_URL to the service
npm run db:push
npm run seed
npm run dev
```

Open the app locally; the frontend calls the agent service over REST.

## Demo Narrative

Say:

> ReviewOps Agent helps engineering managers collect employee-approved success evidence throughout the year and generate grounded review drafts. The demo uses synthetic HRIS data and mock integrations for privacy and reproducibility.

## Scene 1 — Login and Manager Scope

1. Open the app.
2. Select mock login: `Maria — Engineering Manager`.
3. Show manager dashboard.
4. Point out direct reports:
   - Anna
   - Mark
   - Julia
5. Point out that Olek is not shown because he is outside Maria's team.
6. Optional: attempt to access Olek directly and show `403 Access Denied`.

Key message:

> Access control is enforced before data reaches the agent. The model never receives data the current user is not allowed to see.

## Scene 2 — Generate Questionnaire

1. Click `Create questionnaire`.
2. Enter topic:

```text
Create a Q2 collaboration and ownership evidence survey for my direct reports. I want concrete examples, impact, and supporting artifacts.
```

3. Select period: `2026-Q2`.
4. Submit.
5. Show generated questionnaire:
   - title;
   - purpose;
   - privacy mode;
   - questions;
   - explanation for each question.
6. Show Questionnaire Safety Agent result.
7. Approve questionnaire.

Key message:

> The manager does not manually write the survey from scratch. The Questionnaire Agent proposes it, the Safety Agent reviews it, and the manager approves before anything is sent.

## Scene 3 — Personal Token Links

1. After approval, show mock outbox.
2. Show generated personal links for Anna, Mark, Julia.
3. Emphasize that each token is scoped to one assignment.
4. Copy Anna's link.

Key message:

> In the MVP, the app generates personal token links. Slack delivery is a roadmap item.

## Scene 4 — Employee Submits Weak Evidence

1. Open Anna's personal link in a new browser tab.
2. Show questionnaire purpose and privacy notice.
3. Submit weak answer:

```text
I helped with frontend.
```

4. Submit.
5. Show Evidence Validator follow-up:

```text
Can you add one concrete example, who benefited, what changed, and any link or artifact that supports it?
```

Key message:

> The agent improves evidence quality before it reaches the manager review workflow.

## Scene 5 — Employee Improves Evidence

Submit improved answer:

```text
I refactored the shared tooltip component and helped Mark integrate it in the billing screen. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123 and BUG-45.
```

Show resulting evidence card:

- summary;
- impact;
- mapped company value;
- quality score;
- evidence ID.

Key message:

> ReviewOps turns free-text answers into structured, review-ready evidence cards.

## Scene 6 — Manager Views Results

1. Return to Maria dashboard.
2. Open questionnaire results.
3. Show:
   - response status;
   - strong/weak evidence count;
   - mapped values;
   - gaps or warnings.

Key message:

> Maria sees results only for her direct reports.

## Scene 7 — Generate Review Draft

1. Choose Anna.
2. Generate `2026-Q2` review draft.
3. Show review draft Markdown:
   - summary;
   - achievements;
   - evidence-backed examples;
   - growth areas;
   - suggested next-period goals;
   - evidence references.

Key message:

> The draft is generated from approved evidence, not from raw HR data or model imagination.

## Scene 8 — Fairness and Grounding Check

Show Fairness and Grounding Agent warnings:

- unsupported claim warning;
- vague praise warning;
- recency bias warning, if present;
- sensitive data warning, if present.

Example:

```text
Warning: The claim "Anna consistently improves team velocity" is too broad and not directly supported by evidence. Suggested replacement: "Anna reduced duplicated UI logic by refactoring the shared tooltip component, supported by Evidence E-004."
```

Key message:

> The system reviews the review draft before manager approval.

## Scene 9 — Approve and Export

1. Manager approves final draft.
2. Export Markdown.
3. Open exported file path.

Key message:

> The final action is human-approved and auditable.

## Closing Message

Say:

> ReviewOps demonstrates multi-agent workflow, tool-mediated data access, permission filtering, privacy-aware context preparation, evidence validation, human approval, and grounded review generation. The demo uses synthetic data and mock connectors, but the architecture is designed for future Lattice, BambooHR, Notion, and Slack adapters.
