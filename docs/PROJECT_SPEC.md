# ReviewOps Agent — Project Specification

> **Architecture note (current):** ReviewOps is now a **hybrid** — a TypeScript
> Next.js frontend + a **Python ADK 2.0 agent service** (graph `Workflow`s,
> Gemini). See `ARCHITECTURE.md`. Delivered beyond the original MVP:
> **dynamic, manager-driven questionnaires** (per-item matrix, sections, opt-in
> gates, shared scale legend, number/date/email types, a deterministic output
> normalizer, and refine-and-regenerate); a **standalone employee evidence flow**
> with **confidence-gated routing** + **confirm-before-store / dedup / lock** and
> raw-text + concern capture; **manager evidence views** (raw quote + agent
> concern); and a **mock BambooHR/Lattice connector** behind typed contracts whose
> peer-review / feedback / 1:1 signals ground the review draft (transient, not
> stored). **Deployed live** (Vercel + Cloud Run + Turso) and **evaluated on
> Vertex** (see [EVAL_RESULTS.md](EVAL_RESULTS.md)). Still postponed: the **annual
> review-cycle reminder** event. The agent service requires a Gemini API key.

## 1. Project Name

**ReviewOps Agent**

## 2. One-liner

ReviewOps Agent is a permission-aware, evidence-grounded assistant for engineering managers. It helps managers generate targeted questionnaires for their direct reports, collect employee-approved success evidence, validate evidence quality, and generate interim or annual review drafts with human approval.

## 3. Recommended Capstone Track

Primary track: **Agents for Business**

Alternative track: **Concierge Agents**

## 4. Why this is an agent project, not just a chat app

A normal chat assistant can help a manager write a review if all context is pasted manually. ReviewOps Agent is different because it runs a structured workflow:

1. It reads team structure from a mock HRIS connector.
2. It enforces manager/direct-report permissions before any agent sees data.
3. It generates questionnaires from a manager's goal or topic.
4. It creates personal response links for employees.
5. It validates responses and asks follow-up questions when evidence is too vague.
6. It turns submitted answers into evidence cards.
7. It maps evidence to goals, role expectations, and company values.
8. It drafts a review only from approved evidence.
9. It checks the draft for unsupported claims, vague feedback, recency bias, and sensitive data.
10. It requires manager approval before export.

The project demonstrates long-running business workflow design, multi-agent orchestration, tools, memory/state, privacy filtering, access control, and human-in-the-loop approval.

## 5. Product Problem

Engineering managers often prepare annual and interim reviews from incomplete memory, scattered notes, self-reviews, Slack messages, project artifacts, and last-minute evidence gathering. This can create problems:

- early-year achievements are forgotten;
- recent events are over-weighted;
- feedback becomes vague;
- evidence is scattered across systems;
- employees do not have a structured place to record success evidence;
- managers spend too much time collecting context;
- review drafts can contain unsupported claims;
- sensitive data may accidentally be included in AI prompts.

## 6. Product Goal

Build a working MVP where:

1. A manager logs in through a mock login.
2. The system loads the manager's direct reports from a mock HRIS connector.
3. The manager asks the agent to generate a questionnaire for a topic, period, and team.
4. The agent proposes questions and the manager approves them.
5. The system creates personal token links for each employee.
6. Employees answer through their personal links.
7. The Evidence Validator Agent checks whether answers are specific, impact-oriented, and usable as review evidence.
8. The manager sees results only for their direct reports.
9. The manager can generate an interim or annual review draft for one direct report.
10. The Fairness and Grounding Agent checks whether the draft is supported by evidence.
11. The manager approves or edits the final draft.
12. The system exports the result as Markdown.

## 7. MVP Scope

### Included in MVP

- TypeScript/Node.js implementation.
- Next.js full-stack app using the App Router.
- SQLite database with Drizzle ORM or Prisma.
- **Python ADK 2.0 agent service** (graph `Workflow`s) — the agent brain.
  (Original MVP ran agents in-process in TypeScript; superseded.)
- Gemini API (required for the agent service; no offline mock).
- TS app calls the agent service over REST; permissions enforced before the call.
- Mock HRIS connector with employees, managers, roles, teams, goals, and role expectations.
- Mock login selector.
- Manager dashboard.
- Questionnaire generation flow.
- Questionnaire safety review.
- Personal token links for respondents.
- Employee response page.
- Evidence validation.
- Manager results page.
- Review draft generation.
- Fairness and grounding check.
- Markdown export.
- Audit log.
- Basic automated tests for access control, tokens, evidence validation, and review generation.
- Documentation for Kaggle submission.

### Not included in MVP

- Real Lattice integration.
- Real BambooHR integration.
- Real Slack delivery.
- Real email delivery.
- Real SSO.
- Real compensation or promotion workflow.
- Automatic HR decisions.
- Raw Slack history ingestion.
- Raw meeting transcript ingestion.
- Automatic external actions without manager approval.

## 8. Roadmap / TODO after MVP

### Slack Integration

Later, replace mock outbox with Slack delivery:

- Send personal questionnaire links via Slack DM.
- Send reminders for incomplete questionnaires.
- Notify manager when responses are complete.
- Require manager approval before sending any Slack message.

### Lattice / BambooHR Integration

Later, replace mock HRIS connector with real adapters:

- Fetch employees.
- Fetch manager/direct-report relationships.
- Fetch goals.
- Fetch review cycles.
- Fetch role or competency metadata where available.

### Notion / Knowledge Base Integration

Later, use Notion or another knowledge base for:

- company values;
- engineering ladder;
- role expectations;
- project context;
- review-writing guidelines.

## 9. Target Users

### Engineering Manager

Needs to:

- create questionnaires for direct reports;
- collect evidence throughout the year;
- see response status;
- generate grounded review drafts;
- verify that review claims are supported by evidence;
- approve or edit outputs.

### Employee

Needs to:

- answer questionnaires;
- submit success evidence;
- attach or reference artifacts;
- decide whether submitted evidence can be used in review preparation;
- receive follow-up prompts when answers are too vague.

### HR/Admin

Out of MVP scope, but a future role may:

- manage company values;
- manage role expectations;
- configure review cycles;
- audit access logs.

## 10. Demo Users

Use synthetic data only.

| Name | Email | Role | Manager |
| --- | --- | --- | --- |
| Maria | maria.manager@example.com | Engineering Manager | None |
| Anna | anna.frontend@example.com | Senior Frontend Engineer | Maria |
| Mark | mark.backend@example.com | Middle Backend Engineer | Maria |
| Julia | julia.qa@example.com | QA Engineer | Maria |
| Olek | olek.platform@example.com | Platform Engineer | Another Manager |

Company values:

- Own It
- Act with Speed
- Challenge Convention
- Work in the Grey
- Stand Out by Design

Sample goals:

- Improve product delivery reliability.
- Reduce customer-facing defects.
- Improve cross-team collaboration.
- Mentor team members.
- Improve technical documentation.

## 11. Main Demo Scenario

### Scenario: Manager creates Q2 collaboration evidence questionnaire

1. User logs in as `maria.manager@example.com`.
2. Dashboard shows direct reports: Anna, Mark, Julia.
3. Dashboard does not show Olek.
4. Maria enters:

   > Create a Q2 collaboration and ownership evidence survey for my direct reports. I want concrete examples, impact, and links to supporting artifacts.

5. Questionnaire Agent generates the survey — a short evidence set, or a full
   per-item matrix with sections + a rating-scale legend if Maria pasted that
   structure (she can also **refine & regenerate** with feedback).
6. Questionnaire Safety Agent checks the questions.
7. Maria approves the questionnaire.
8. System creates personal links for Anna, Mark, and Julia.
9. Anna opens her personal link.
10. Anna submits a weak answer: "I helped with frontend."
11. Evidence Validator Agent flags the answer as too vague and asks for a concrete example, impact, and supporting artifact.
12. Anna improves the answer: "I refactored the shared tooltip component and helped Mark integrate it in the billing screen. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123 and BUG-45."
13. Manager opens results page.
14. System shows response status, evidence quality, weak evidence warnings, and mapped company values.
15. Manager asks for Anna's mid-year review draft.
16. Review Draft Agent generates a draft with evidence references.
17. Fairness and Grounding Agent flags unsupported claims and suggests edits.
18. Manager approves and exports the final Markdown review.

## 12. Core User Stories

### Manager Stories

1. As a manager, I can see only my direct reports.
2. As a manager, I can generate a questionnaire from a topic and purpose.
3. As a manager, I can approve or edit generated questions before sending.
4. As a manager, I can send a questionnaire to my direct reports through generated personal links.
5. As a manager, I can see response status.
6. As a manager, I can view submitted evidence only for employees I manage.
7. As a manager, I can generate an interim or annual review draft for one direct report.
8. As a manager, I can see which evidence supports each review claim.
9. As a manager, I can approve or edit the final draft.

### Employee Stories

1. As an employee, I can open my personal questionnaire link.
2. As an employee, I can submit answers and evidence.
3. As an employee, I can attach or reference artifacts.
4. As an employee, I can see whether the survey is named, anonymous, or review-related.
5. As an employee, I can mark whether submitted evidence may be used for review preparation.
6. As an employee, I get a follow-up prompt when my answer is too vague.

### Security Stories

1. As an outside manager, I cannot access employees outside my team.
2. As an employee, I cannot access another employee's questionnaire response.
3. As an expired token holder, I cannot submit a response.
4. As the system, I do not send raw HR data to the AI model.
5. As the system, I minimize and sanitize data before model calls.
6. As the system, I keep an audit log of sensitive actions.

## 13. Ethical Positioning

ReviewOps Agent must not be positioned as a system that automatically evaluates, ranks, promotes, or penalizes employees.

Correct positioning:

- It helps collect and organize evidence.
- It helps managers draft better reviews.
- It requires manager approval.
- It highlights unsupported claims.
- It gives employees a structured place to submit their own evidence.
- It supports fairness by grounding review statements in concrete evidence.

Incorrect positioning:

- "AI decides employee performance."
- "AI ranks employees."
- "AI monitors all work automatically."
- "AI replaces the manager."
- "AI reads all private communications."

## 14. Final Output

The final review export should be a Markdown file with:

- employee name or alias;
- role;
- review period;
- summary;
- achievements;
- evidence-backed examples;
- growth areas;
- suggested next-period goals;
- evidence references;
- fairness and grounding warnings;
- manager approval status.
