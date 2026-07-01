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

## Agentic & platform roadmap (hybrid + applied frameworks)

Beyond the product integrations below, the **Python ADK 2.0 agent service** has
its own hardening roadmap, driven by Google's 2026 *Security & Evaluation* and
*Agent Skills* whitepapers (see `ARCHITECTURE.md` §4).

### A. Agent service & deployment
- ✅ All three workflows ported (questionnaire ✅, evidence ✅, review ✅) and wired
  over REST; in-process TS agents removed.
- ✅ Standalone **employee evidence flow** + **confidence-gated routing**
  (auto-approve vs manager review queue) + **confirm-before-store / dedup / lock**.
- ✅ **Dynamic questionnaires** (per-item matrix, sections, opt-in gates, scale
  legend, number/date/email, deterministic normalizer, refine-and-regenerate).
- ✅ **Mock BambooHR/Lattice connector** behind typed contracts; peer/feedback/1:1
  signals fold into review grounding (transient, not stored).
- ⬜ Deploy: Python service → **Agent Runtime** (`agents-cli deploy`); Next.js →
  Cloud Run/Vercel. ⬜ Optional `RequestInput` HITL for the weak-evidence pause.

### B. Ambient (event-driven)
- ✅ **In-app deadlines & nudges** — questionnaire `deadline`, overdue detection,
  per-questionnaire completion on the manager dashboard, and "Send reminders"
  writing nudge rows to the outbox (`remindersService`).
- ⬜ Make it truly event-driven: **Cloud Scheduler → `/api/cron/reminders`** (or
  Pub/Sub) to auto-nudge without a manual click; auto-close questionnaires past
  deadline; review-season reminders.

### B2. Capstone submission & ops (high priority — deadline 2026-07-06)
- 🔴 **Submission artifacts (HIGH):** finalize the Kaggle Writeup (≤2,500 words,
  *Agents for Business*), a cover image, and a **≤5-min YouTube demo video**; a
  public project link (live demo **or** public GitHub repo with setup). These are
  *required* for eligibility and worth 30 of 100 points — do not let them slip.
- **Publish/verify the public GitHub repo.** A local git repo already exists; it
  wasn't visible from the assistant's shell because the working directory was the
  wrong folder (`X:\dev\RavenGame`, not `X:\dev\ReviewOpsAgent`). Action: confirm
  the repo, push, and make it public with the README as the front door.
- **CI (GitHub Actions).** *Why:* catch regressions automatically on every push so
  the submission stays green. *What:* `.github/workflows/ci.yml` running
  `npm run typecheck` + `npm test` + `npm run build` (fast, no GCP). Separately, a
  **manual/scheduled** job can run `agents-cli eval` — it needs Vertex ADC as GitHub
  secrets and costs money per run, so it is **not** wired to every PR. (Recorded
  here so it isn't re-scoped later.)

### C. Security (7-Pillar) — beyond today's baseline
Today: access control before model, pre-LLM PII redaction, HITL approval, no
secrets in frontend, audit trail. Roadmap: prompt-injection screening + LLM
firewall (Pillar 4); secrets-scan/SAST in CI; agentic identity + JIT downscoping
(Pillar 5); Red/Blue/Green teaming + circuit breakers (Pillar 6); MCP contextual
authorization; EU AI Act governance/attestation (Pillar 7).

### D. Observability
- OpenTelemetry export (`agent.session/think/tool`) → Cloud Trace; token-cost
  accounting; tail-based sampling; intent-drift / AgBOM monitoring.

### E. Skills
- Author a **skills library** (`drafting-performance-reviews`,
  `validating-evidence`, …) loaded via ADK `SkillToolset`; EDD eval + Read→Draft→Act
  graduation; later, meta-skills (agent-drafted, human-reviewed).

### F. Evaluation
- ✅ Golden datasets + rubrics authored for all three workflows
  (`agent-service/tests/eval/`); no-GCP `structural_smoke.py` in place.
- ✅ **Ran `agents-cli eval generate/grade`** on Vertex — baseline recorded
  (questionnaire 4.43→**5.00**, evidence/review **5.00**); the run surfaced the
  safety silent-substitution gap → fixed with **hard-refuse** + rubric
  calibration; verified via `eval compare` (see `EVALUATION_PLAN.md` §0.4, §2.4).
- ⬜ Wire the eval run into CI; chase the two residual flakes (Vertex autorater
  JSON parse; review-draft markdown-fence, ADK-retry-covered).

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

The **connector boundary already exists** (`src/server/connectors/` — typed
`DirectoryConnector` + `PerformanceConnector` contracts with a mock provider).
This phase replaces the mock provider with a real adapter (or MCP server) behind
the same interface.

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
