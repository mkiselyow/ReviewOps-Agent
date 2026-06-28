# Prompt for Coding Agent — Build ReviewOps Agent MVP

> **Historical artifact.** This prompt produced the original **all-TypeScript**
> MVP. The project has since moved to a **hybrid** architecture (TS frontend +
> Python ADK 2.0 agent service) — see `ARCHITECTURE.md`. Kept for provenance; do
> not follow it for the current design.

You are a senior TypeScript full-stack engineer and AI agent architect. Build a working MVP for a Kaggle AI Agents capstone project called **ReviewOps Agent**.

The project is a permission-aware, evidence-grounded assistant for engineering managers. It helps managers generate questionnaires for their direct reports, collect employee-approved evidence, validate evidence quality, and generate grounded interim or annual review drafts.

## Important Implementation Choice

Use **TypeScript/Node.js**, not Python.

Use Google ADK for TypeScript where practical. If ADK integration becomes slow or blocked, create a clean agent abstraction with deterministic fallbacks and document where ADK agents should be connected. The app must remain runnable locally without an API key.

## Tech Stack

Use:

- TypeScript
- Node.js 24.13.0+ if using ADK TypeScript quickstart requirements
- Next.js App Router
- SQLite
- Drizzle ORM or Prisma
- Zod for validation
- Vitest or Jest for tests
- Google ADK for TypeScript where practical
- Gemini API if configured
- deterministic mock model fallback if no model API key is available

Do not build a complex React SPA. Use simple Next.js pages and forms.

## Environment Variables

Use:

```text
DATABASE_URL=file:./data/reviewops.sqlite
GOOGLE_API_KEY=
USE_MOCK_MODEL=true
TOKEN_EXPIRY_HOURS=168
```

If `GOOGLE_API_KEY` is missing or `USE_MOCK_MODEL=true`, the app must still work using deterministic mock agent outputs.

## Required Project Structure

Create this structure:

```text
reviewops-agent/
  README.md
  package.json
  tsconfig.json
  .env.example
  drizzle.config.ts or prisma/schema.prisma
  next.config.ts

  src/
    app/
      page.tsx
      login/page.tsx
      manager/page.tsx
      manager/questionnaires/new/page.tsx
      manager/questionnaires/[id]/preview/page.tsx
      manager/questionnaires/[id]/results/page.tsx
      manager/reviews/[employeeId]/new/page.tsx
      manager/reviews/[draftId]/page.tsx
      employee/survey/[token]/page.tsx
      audit/page.tsx
      api/
        login/route.ts
        questionnaires/route.ts
        questionnaires/[id]/approve/route.ts
        survey/[token]/submit/route.ts
        reviews/generate/route.ts
        reviews/[draftId]/approve/route.ts
        reviews/[draftId]/export/route.ts

    components/
      Layout.tsx
      UserSwitcher.tsx
      DirectReportsList.tsx
      QuestionnaireForm.tsx
      QuestionnairePreview.tsx
      SurveyResponseForm.tsx
      EvidenceCard.tsx
      ReviewDraftViewer.tsx
      AuditLogTable.tsx

    server/
      db/
        index.ts
        schema.ts
        seed.ts
      auth/
        mockSession.ts
        rbac.ts
        permissions.ts
      agents/
        orchestrator.ts
        prompts.ts
        questionnaireAgent.ts
        questionnaireSafetyAgent.ts
        evidenceValidatorAgent.ts
        valuesMapperAgent.ts
        reviewDraftAgent.ts
        fairnessGroundingAgent.ts
        privacyFilterAgent.ts
        modelProvider.ts
      services/
        hrisService.ts
        surveyService.ts
        evidenceService.ts
        reviewService.ts
        outboxService.ts
        auditService.ts
        exportService.ts
      tools/
        hrisTools.ts
        surveyTools.ts
        evidenceTools.ts
        reviewTools.ts
        privacyTools.ts
      utils/
        crypto.ts
        markdown.ts
        dates.ts

  data/
    seed/
      employees.json
      goals.json
      company-values.md
      role-expectations.md
      sample-evidence.json
    attachments/
    exports/

  tests/
    permissions.test.ts
    tokens.test.ts
    survey-flow.test.ts
    evidence-validation.test.ts
    review-generation.test.ts

  docs/
    PROJECT_SPEC.md
    ARCHITECTURE_AND_SECURITY.md
    DEMO_SCRIPT.md
    EVALUATION_PLAN.md
    ROADMAP.md
    KAGGLE_WRITEUP_DRAFT.md
```

## Required App Flows

### 1. Mock Login

Create a mock login page with selectable users:

- Maria — Engineering Manager
- Anna — Senior Frontend Engineer, direct report of Maria
- Mark — Middle Backend Engineer, direct report of Maria
- Julia — QA Engineer, direct report of Maria
- Olek — Engineer outside Maria’s team

Session should store current user ID using a simple cookie or server-side mock session helper.

### 2. Manager Dashboard

When logged in as Maria, show:

- direct reports only;
- create questionnaire button;
- existing questionnaires;
- response status;
- link to audit log.

Do not show Olek as Maria’s direct report.

### 3. Access Control

Implement real backend access-control checks.

Rules:

- manager can view only direct reports;
- employee can view only their own assignment/response;
- token link gives access only to one survey assignment;
- outside employee access should return 403;
- do not rely on LLM prompts for security.

Create tests for these rules.

### 4. Questionnaire Generation

Manager enters:

- topic;
- period;
- purpose;
- optional custom notes.

Example:

> Create a Q2 collaboration and ownership evidence survey for my direct reports. I want concrete examples, impact, and supporting artifacts.

Questionnaire Agent should generate:

- title;
- purpose;
- privacy mode;
- 5–7 questions;
- suggested question type;
- explanation for each question.

Questionnaire Safety Agent should check:

- questions are work-related;
- no sensitive or protected topics;
- no manipulative wording;
- no accusatory wording;
- not too long.

Manager must approve questionnaire before links are generated.

### 5. Personal Token Links

After approval, create one assignment per direct report and generate personal links.

Use secure random tokens.

Important:

- store token hash, not raw token;
- token maps to exactly one assignment;
- token has expiry;
- respondent identity comes from assignment, not from form input;
- token cannot access manager results.

For MVP, show generated links in a mock outbox page. Add a TODO for Slack delivery later.

### 6. Employee Response Page

Employee opens:

```text
/employee/survey/{token}
```

Show:

- questionnaire title;
- purpose;
- privacy notice;
- questions;
- optional evidence link fields;
- optional attachment upload field or placeholder;
- submit button.

For MVP, attachments can be metadata-only or simple local file upload.

### 7. Evidence Validation

After submission, Evidence Validator Agent should process each long-form answer.

It should produce:

- evidence summary;
- impact;
- mapped company value;
- quality score;
- missing fields;
- follow-up question if answer is too vague.

If an answer is weak, show a follow-up prompt and allow the employee to improve the answer.

Example weak answer:

```text
I helped with frontend.
```

Expected follow-up:

```text
Can you add one concrete example, who benefited, what changed, and any link or artifact that supports it?
```

### 8. Manager Results

Manager can open questionnaire results and see:

- response status by direct report;
- submitted evidence;
- evidence quality score;
- weak evidence warnings;
- mapped company values;
- missing areas.

Manager cannot see results for employees outside their team.

### 9. Review Draft Generation

Manager can select one direct report and generate a review draft for a period.

Review Draft Agent should use:

- employee role;
- goals;
- company values;
- role expectations;
- approved evidence cards;
- manager notes if available.

Output Markdown with:

- summary;
- achievements;
- evidence-backed examples;
- growth areas;
- suggested next-period goals;
- evidence references;
- manager approval status.

Every meaningful claim should reference one or more evidence IDs.

### 10. Fairness and Grounding Check

Fairness and Grounding Agent should check the review draft.

It should flag:

- unsupported claims;
- vague praise;
- vague criticism;
- recency bias risk;
- source imbalance;
- sensitive personal data;
- promotion/compensation language.

Show warnings before manager approval.

### 11. Export

Allow manager to export approved review draft as Markdown into:

```text
data/exports/
```

### 12. Audit Log

Record audit events:

- login;
- questionnaire created;
- questionnaire approved;
- assignments created;
- response submitted;
- evidence validated;
- review draft generated;
- review approved;
- denied access attempt.

Add simple audit log page.

## Required Agents

Implement these agents as separate modules, even if some use deterministic mock outputs when no model key is available:

- Orchestrator Agent
- Questionnaire Agent
- Questionnaire Safety Agent
- Evidence Validator Agent
- Values Mapper Agent
- Review Draft Agent
- Fairness and Grounding Agent
- Privacy Filter Agent

Each agent should have:

- clear input schema;
- clear output schema;
- prompt or deterministic fallback;
- basic tests where practical.

## Required Tools / Services

Implement tool/service wrappers:

- HRIS service: mock employee/team/goal data
- Survey service: questionnaires, questions, assignments, tokens, responses
- Evidence service: evidence cards, quality scores, attachments
- Review service: review context, drafts, approval, export
- Privacy service: sanitize context before model calls
- Audit service: audit events

Agents must not bypass services for permission-sensitive data.

## Seed Data

Company values:

- Own It
- Act with Speed
- Challenge Convention
- Work in the Grey
- Stand Out by Design

Employees:

- Maria, Engineering Manager
- Anna, Senior Frontend Engineer, manager Maria
- Mark, Middle Backend Engineer, manager Maria
- Julia, QA Engineer, manager Maria
- Olek, Engineer outside Maria’s team

Goals:

- Improve product delivery reliability
- Reduce customer-facing defects
- Improve cross-team collaboration
- Mentor team members
- Improve technical documentation

Role expectations:

- Senior Engineer: delivery, ownership, mentoring, technical judgment, cross-team collaboration
- Middle Engineer: reliable delivery, learning growth, collaboration, code quality
- QA Engineer: quality ownership, risk detection, test strategy, cross-functional collaboration

## README Requirements

README must include:

- project description;
- business problem;
- agent architecture;
- setup instructions;
- environment variables;
- how to run;
- demo flow;
- security model;
- limitations;
- roadmap;
- Kaggle capstone concepts demonstrated.

## Commands

Expected commands:

```bash
npm install
cp .env.example .env
npm run db:push
npm run seed
npm run dev
```

Tests:

```bash
npm test
```

## Demo Path

Make sure the following demo works:

1. Start app.
2. Log in as Maria.
3. See direct reports Anna, Mark, Julia.
4. Confirm Olek is not visible.
5. Create questionnaire from a topic.
6. Approve generated questions.
7. Open mock outbox and copy Anna’s personal link.
8. Submit weak answer as Anna.
9. See evidence validator request improvement.
10. Submit improved answer.
11. Return as Maria.
12. See results.
13. Generate Anna review draft.
14. See grounding/fairness warnings.
15. Approve and export Markdown.

## Important Constraints

Do not implement automatic HR decisions.

Do not rank employees.

Do not make compensation or promotion decisions.

Do not send real Slack/email messages.

Do not use real HR data.

Do not expose responses across manager scopes.

Do not send raw personal data to the model. Use a privacy filter before model calls.

Do not rely on the model for access control.

## Output Expected

Generate the full project scaffold and implementation.

Prioritize a working MVP over polish.

If something is ambiguous, choose the simplest secure implementation and document it in README.
