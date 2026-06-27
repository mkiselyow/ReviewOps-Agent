# ReviewOps Agent — Architecture and Security Design

## 1. Architecture Overview

ReviewOps Agent is a TypeScript full-stack application with an agent orchestration layer, mock HRIS connector, survey workflow, evidence store, access-control layer, privacy gateway, and review-generation pipeline.

Recommended MVP architecture:

```text
Next.js UI / Server Actions / Route Handlers
  ↓
Auth + RBAC + Permission Filter
  ↓
Business Services
  ↓
Agent Orchestrator
  ↓
Tools / Connectors / Evidence Store
  ↓
SQLite + Local Files + Mock HRIS
```

## 2. Recommended Tech Stack

### Application

- TypeScript
- Node.js 24.13.0+ if using current ADK TypeScript quickstart requirements
- Next.js App Router
- SQLite
- Drizzle ORM or Prisma
- Zod for validation
- Vitest or Jest for tests
- Markdown export

### Agent Layer

- Google ADK for TypeScript where practical
- Gemini model provider when API key is available
- Deterministic mock-model fallback when no API key is configured
- Agent prompts stored as versioned TypeScript constants or `.md` prompt files

### UI

Use simple Next.js pages and forms:

- mock login;
- manager dashboard;
- create questionnaire;
- questionnaire preview;
- employee response page;
- manager results page;
- review draft page;
- audit log page.

Do not build a large frontend system. Prioritize working MVP and demo clarity.

## 3. Project Structure

```text
reviewops-agent/
  README.md
  package.json
  tsconfig.json
  .env.example
  drizzle.config.ts
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
    PROMPT_FOR_CODING_AGENT.md
```

## 4. Core Data Model

Use SQLite tables.

### users

```text
id
email
display_name
role_title
department
manager_id
employment_status
is_hr_admin
created_at
updated_at
```

### goals

```text
id
employee_id
title
description
period
status
created_at
updated_at
```

### questionnaires

```text
id
created_by_manager_id
title
purpose
period
privacy_mode
status
created_at
approved_at
sent_at
closed_at
```

Statuses:

```text
draft
approved
sent
closed
archived
```

Privacy modes:

```text
named_review_evidence
anonymous_team_pulse
confidential_hr_only
```

For MVP, prioritize `named_review_evidence`.

### questions

```text
id
questionnaire_id
position
question_type
text
options_json
required
created_at
```

Question types:

```text
short_text
long_text
single_choice
multi_choice
rating
evidence_link
attachment
```

### survey_assignments

```text
id
questionnaire_id
respondent_id
token_hash
expires_at
status
created_at
opened_at
submitted_at
```

Statuses:

```text
pending
opened
submitted
expired
revoked
```

### responses

```text
id
assignment_id
question_id
answer_text
visibility
created_at
updated_at
```

Visibility options:

```text
private_draft
share_with_manager
allow_for_review
anonymous_aggregate
```

### evidence_items

```text
id
employee_id
source_type
source_id
summary
impact
period
company_value
goal_id
quality_score
confidence
visibility
created_at
updated_at
```

Source types:

```text
questionnaire_response
manual_upload
manager_note
mock_github
mock_lattice
```

### attachments

```text
id
evidence_id
file_path
file_name
content_type
pii_scan_status
uploaded_by
created_at
```

### review_drafts

```text
id
employee_id
manager_id
period
draft_markdown
grounding_report_json
fairness_report_json
status
created_at
approved_at
exported_at
```

Statuses:

```text
draft
needs_revision
approved
exported
```

### audit_logs

```text
id
actor_id
action
resource_type
resource_id
metadata_json
created_at
```

## 5. Agent System

The project should use multiple specialized agents coordinated by an orchestrator.

### 5.1 Orchestrator Agent

Responsibilities:

- route workflows;
- call specialized agents;
- combine outputs;
- request human approval before final actions;
- produce structured outputs.

### 5.2 Questionnaire Agent

Input:

- manager topic;
- purpose;
- period;
- target role/team;
- company values;
- role expectations.

Output:

- questionnaire title;
- purpose;
- 5–7 questions;
- suggested question types;
- suggested privacy mode;
- explanation for each question.

Rules:

- questions must be work-related;
- collect concrete examples;
- ask for impact;
- ask for evidence links or attachments;
- keep the questionnaire short.

### 5.3 Questionnaire Safety Agent

Checks:

- no health/family/politics/religion/nationality/private-life/salary/immigration questions;
- no manipulative wording;
- no accusatory wording;
- no leading questions;
- all questions are relevant to work evidence or team process.

Output:

- approved / needs revision;
- risky questions;
- safer alternatives.

### 5.4 Evidence Validator Agent

Input:

- employee answer;
- question;
- period;
- role expectations;
- company values.

Output:

- evidence summary;
- impact;
- mapped company value;
- quality score;
- missing fields;
- follow-up question if weak.

Evidence quality dimensions:

- specificity;
- impact;
- source support;
- relevance to goal/value;
- time period clarity;
- review usability.

### 5.5 Values Mapper Agent

Maps evidence cards to:

- company values;
- employee goals;
- role expectations;
- confidence score.

### 5.6 Review Draft Agent

Generates Markdown review drafts from sanitized context.

Rules:

- do not invent facts;
- every meaningful claim should reference evidence IDs;
- use professional manager-review tone;
- avoid compensation, promotion, or ranking decisions;
- do not include sensitive personal data.

### 5.7 Fairness and Grounding Agent

Flags:

- unsupported claims;
- vague praise;
- vague criticism;
- recency bias risk;
- source imbalance;
- sensitive personal data;
- compensation/promotion/ranking language.

### 5.8 Privacy Filter Agent

Converts raw internal data into minimized model context.

Rules:

- remove personal address, phone, birth date, national ID, salary, health data, family information, private notes, and unrelated sensitive data;
- keep only role, goals, period, evidence, work-related context, and approved manager notes;
- log categories removed, not removed values.

## 6. Tools / Services

Agents must access data only through services/tools. They should not directly query the database.

### HRIS Tools

```text
getCurrentUser()
getDirectReports(managerId)
getEmployeeProfile(employeeId)
getEmployeeGoals(employeeId, period)
getRoleExpectations(roleTitle)
```

For MVP, tools read mock HRIS data.

### Survey Tools

```text
createQuestionnaire(managerId, title, purpose, period, privacyMode)
addQuestion(questionnaireId, question)
approveQuestionnaire(questionnaireId, managerId)
createSurveyAssignments(questionnaireId, respondentIds)
getAssignmentByToken(token)
submitResponse(assignmentId, answers)
getQuestionnaireResults(managerId, questionnaireId)
```

### Evidence Tools

```text
createEvidenceItem(employeeId, responseId, summary, impact, value, goalId, qualityScore)
attachFile(evidenceId, file)
getEmployeeEvidence(managerId, employeeId, period)
```

### Review Tools

```text
generateReviewContext(managerId, employeeId, period)
saveReviewDraft(managerId, employeeId, markdown, reports)
approveReviewDraft(managerId, draftId)
exportReviewMarkdown(draftId)
```

### Privacy Tools

```text
sanitizeContext(rawContext)
redactPii(text)
scanAttachmentMetadata(file)
```

## 7. Access Control

Access control must happen before data reaches the AI model.

### Manager Scope

For MVP:

```text
canViewEmployee(managerId, employeeId) = employee.manager_id === managerId
```

### Employee Scope

Employees can access only their own questionnaire assignments and evidence.

### Token Scope

A survey token can only access one assignment.

Token must not grant access to manager results.

### No Prompt-Based Security

Never rely on a prompt like “do not reveal data.” Permissions must be enforced in TypeScript code before the agent receives context.

## 8. Token Design

Employee questionnaire links use secure random tokens.

URL format:

```text
/employee/survey/{token}
```

Rules:

- generate token with `crypto.randomBytes` or Web Crypto;
- store only token hash;
- bind token to one assignment;
- set expiration;
- support revoked status;
- never use employee email as token;
- never trust respondent ID from form input;
- respondent ID comes from assignment resolved by token.

## 9. Personal Data Handling

The system should not duplicate full HR profiles.

Mock HRIS is source of truth for:

- employee identity;
- manager relationship;
- role;
- team;
- official goals.

ReviewOps stores:

- questionnaires;
- responses;
- employee-submitted evidence;
- attachments;
- evidence quality scores;
- generated review drafts;
- approval state;
- audit logs.

Before sending anything to the model:

```text
raw data
→ permission filter
→ data minimization
→ PII redaction
→ evidence-card normalization
→ model call
```

## 10. Human-in-the-Loop

Human approval is required before:

- sending questionnaires;
- closing questionnaires;
- generating final review drafts;
- approving review drafts;
- exporting review results.

For MVP, “send questionnaire” means generating personal links and showing them in mock outbox.

## 11. Testing Requirements

Automated tests should cover:

- manager cannot view outside-team employee;
- employee token cannot access another assignment;
- expired token is denied;
- questionnaire generation returns valid schema;
- sensitive question is rejected;
- vague answer gets follow-up request;
- review draft includes evidence references;
- unsupported review claim is flagged.
