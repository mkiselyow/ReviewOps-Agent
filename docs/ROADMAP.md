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
- ✅ **Deployed live** — Python agent service → **Cloud Run** (Vertex mode, no key in
  image); Next.js frontend → **Vercel** backed by **Turso/libSQL** (dual-driver).
  Live demo: **https://reviewops-agent.vercel.app**. See [DEPLOY.md](DEPLOY.md).
- ⬜ Optional: Python service → **Agent Runtime** (`agents-cli deploy`) to showcase
  ADK-native deploy; `RequestInput` HITL for the weak-evidence pause.

### B. Ambient (event-driven)
- ✅ **In-app deadlines & nudges** — questionnaire `deadline`, overdue detection,
  per-questionnaire completion on the manager dashboard, and "Send reminders"
  writing nudge rows to the outbox (`remindersService`).
- ⬜ Make it truly event-driven: **Cloud Scheduler → `/api/cron/reminders`** (or
  Pub/Sub) to auto-nudge without a manual click; auto-close questionnaires past
  deadline; review-season reminders.

### B2. Capstone submission & ops (high priority — deadline 2026-07-06)
- ✅ **Public project link satisfied** — live demo at
  **https://reviewops-agent.vercel.app** (Vercel + Cloud Run + Turso, verified
  end-to-end).
- 🔴 **Submission artifacts (HIGH, still TODO):** finalize the Kaggle Writeup
  (≤2,500 words, *Agents for Business*), a cover image, and a **≤5-min YouTube demo
  video**. These are *required* for eligibility and worth 30 of 100 points — do not
  let them slip.
- **Optionally also make the GitHub repo public** as a backup project link (the repo
  is `github.com/mkiselyow/ReviewOps-Agent`; currently private).
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

### G. Authentication & abuse protection
- ✅ **Real-use hardening shipped:** HMAC-**signed sessions** (anti-forgery),
  `isTestUser` demo/real split, **passphrase** manager login (throttled),
  **agent shared-secret** (`X-Agent-Key`) + **per-manager rate limit**, and a
  destructive-reseed guard for real data.
- ⬜ **OAuth / Google sign-in** with an **email allowlist** (Auth.js) and/or
  **email magic link** — replace the single passphrase with per-person identity.
- ⬜ **Durable rate limiting** (Upstash/Redis) for a hard *global* quota cap
  (in-memory limiter is per-instance on serverless).
- ⬜ **Cloud Run IAM + OIDC ID token** — make the agent private and have the
  frontend attach a Google-signed token (drop `--allow-unauthenticated`).
- ⬜ Non-destructive `seed:demo` (upsert demo rows only); optional **separate DB**
  for real colleague data (privacy isolation).

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

### Additional performance signals (annual / mid-review grounding)

Beyond today's mock (peer reviews, feedback, 1:1 notes, goal status), extend the
`PerformanceConnector` contract with these Lattice/BambooHR-shaped signals to
better ground trend, impact, and promotion-readiness claims. Each is fetched
**transiently**, PII-redacted and reviewer-anonymized, and folded into review
context via `gatherReviewSignals` — never stored (same posture as the current
connector). Signals marked *context-only* must **not** drive a rating.

- **Self-assessment / prior review** — the employee's own last-cycle review + rating.
  *Why:* enables trend/growth framing across cycles ("since last review…").
- **Goal / OKR progress with metrics** — % complete + key results, not just status.
  *Why:* grounds "impact" claims in measurable outcomes.
- **Recognition / kudos & values-tagged shout-outs** — company-value-tagged praise.
  *Why:* concrete evidence of company-value alignment.
- **Career-ladder / competency matrix** — expected-vs-demonstrated level per
  competency. *Why:* grounds promotion-readiness and level-appropriate expectations.
- **Engagement / eNPS or 1:1 cadence** *(context-only)* — participation/cadence
  signals for context, used carefully; **never** an input to a rating.
- **BambooHR profile facts** — tenure, role/comp *history* (not current salary),
  time-off patterns, training/certifications completed. *Why:* tenure/role context
  and growth via completed training; respect the "no salary/PII" fetch rule below.

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
