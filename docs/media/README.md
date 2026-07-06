# Media (Kaggle writeup + video assets)

Screenshots captured from a **local run seeded with synthetic demo data only**
(same build as the live demo), 1440×900 @2×. Diagram PNGs are 2× exports of the
SVGs in [`../diagrams/`](../diagrams/). Upload these to the Kaggle writeup and
keep the numbered order.

| File | What it shows |
|---|---|
| `01-login.png` | Demo login — one-click synthetic users; real managers use a passphrase (`isTestUser` split) |
| `02-manager-dashboard.png` | Maria's dashboard: direct reports (RBAC-scoped), response tracking, editable deadline + reminders |
| `03-questionnaire-matrix-preview.png` | Generated skill-matrix questionnaire: safety verdict + rationale, shared L1–L5 legend, sections |
| `04-survey-weak-followups.png` (`04b` full) | Evidence validation: weak answers get a quality score, a follow-up question, and missing-detail hints |
| `05-employee-survey-matrix.png` | Employee view of the matrix survey: consent banner, scale legend, per-skill choices |
| `06-mock-outbox.png` | Mock outbox: sent datetime, type badge (link/reminder), personal token links |
| `07-evidence-confirm-gate.png` | Confirm-before-store: thin evidence isn't saved until the employee confirms ("submit anyway") |
| `08-evidence-queue.png` | Manager review queue: quoted raw text, agent summary, concern, approve/reject |
| `09-review-draft.png` | Review draft: privacy-filter categories, evidence-id citations, role-expectation coverage, fairness flags |
| `10-results.png` | Questionnaire results with scores and follow-up history |
| `11-access-denied.png` | RBAC in action: generating a review for another team's employee is refused |
| `12-audit-log.png` | Audit log of sensitive actions |
| `review-sequence.png` | Sequence diagram of one review request — permission assert, consent-gated context, privacy filter, pre-LLM security node, Gemini, save + audit |
| `architecture-detailed.png` · `agent-workflows.png` · `deploy-topology.png` | 2× PNG exports of the architecture diagrams |

Cover image: [`../diagrams/cover.svg`](../diagrams/cover.svg) / `cover.png` (1200×630).
