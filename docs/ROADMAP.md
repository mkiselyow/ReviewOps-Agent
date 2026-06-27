# ReviewOps Agent — Roadmap

## MVP

The MVP uses synthetic data and local tools.

### MVP Features

- Mock HRIS connector.
- Mock login.
- Manager dashboard.
- Questionnaire generation.
- Questionnaire safety review.
- Personal token response links.
- Employee response page.
- Evidence validation.
- Manager results page.
- Review draft generation.
- Fairness and grounding check.
- Markdown export.
- Audit log.
- Access-control tests.

### MVP Non-goals

- Real Slack delivery.
- Real Lattice/BambooHR integration.
- Real SSO.
- Real HR data.
- Compensation decisions.
- Promotion decisions.
- Employee ranking.

## Phase 2 — Slack Delivery

Replace mock outbox with Slack workflow.

### Features

- Slack OAuth.
- Send questionnaire links via Slack DM.
- Send reminders for incomplete questionnaires.
- Notify manager when all responses are submitted.
- Human approval before sending any Slack message.
- Audit log for outbound messages.

### Safety Requirements

- Do not send sensitive content in Slack messages.
- Slack message should contain only short context and a secure link.
- Use scoped Slack app permissions.
- Keep delivery separate from questionnaire access control.

## Phase 3 — Lattice / BambooHR Adapter

Replace mock HRIS with real HRIS connector.

### Features

- Fetch employee directory.
- Fetch manager/direct-report relationships.
- Fetch goals.
- Fetch review cycles.
- Fetch role or competency metadata where available.

### Safety Requirements

- OAuth or API-token based auth.
- Least privilege scopes.
- Do not fetch unnecessary fields.
- Do not fetch salary, personal identifiers, health data, family data, address, phone, or emergency contact data.
- Keep HRIS as source of truth for org structure.
- Keep ReviewOps as evidence/review workflow layer, not HRIS copy.

## Phase 4 — Notion / Knowledge Base Integration

Use Notion or another knowledge base for company context.

### Features

- Company values.
- Engineering ladder.
- Role expectations.
- Project context.
- Review writing guidelines.

### Safety Requirements

- Read-only access at first.
- Allowlisted pages only.
- Audit log for every document read.

## Phase 5 — Employee Portal

Move beyond one-off token links.

### Features

- Employee dashboard.
- Pending questionnaires.
- Evidence journal.
- Draft/private evidence.
- Submitted review evidence.
- Visibility controls.
- Evidence history.

## Phase 6 — Review Cycle Automation

Support recurring review workflows.

### Features

- Quarterly check-ins.
- Mid-year reviews.
- Annual review preparation.
- Reminder schedule.
- Missing evidence alerts.
- Manager action board.

## Phase 7 — Advanced Fairness and Analytics

### Features

- Recency bias detection.
- Evidence density by competency.
- Evidence source distribution.
- Overly vague feedback detection.
- Tone analysis.
- Team-level aggregate insights.

### Safety Requirements

- Avoid employee ranking.
- Avoid hidden surveillance.
- Avoid using anonymous pulse survey answers as individual performance evidence.

## Phase 8 — Production Readiness

### Features

- Real authentication / SSO.
- Role-based admin console.
- Tenant isolation.
- Audit export.
- Data retention controls.
- DSR/delete workflows.
- Encryption at rest for attachments.
- Observability dashboard.

## Long-Term Product Positioning

ReviewOps should remain an evidence organization and review drafting assistant.

It should not become:

- automatic performance scorer;
- employee ranking system;
- surveillance system;
- compensation decision engine;
- replacement for manager judgment.
