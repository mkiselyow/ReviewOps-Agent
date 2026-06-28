# ReviewOps Agent — Architecture (Hybrid)

> **This supersedes the original all-TypeScript design in
> `ARCHITECTURE_AND_SECURITY.md`.** The agent brain has moved to a **Python ADK
> 2.0 service**; the Next.js app is now the frontend. See "Why hybrid" below.

ReviewOps Agent is a permission-aware, evidence-grounded assistant for
engineering managers. It generates questionnaires, collects employee-approved
evidence, validates evidence quality, and drafts grounded reviews — always with
human approval.

The design deliberately applies two Google 2026 whitepapers:
- **Vibe Coding Agent Security & Evaluation** (7-Pillar security, evaluation
  framework, observability).
- **Agent Skills** (SKILL.md + progressive disclosure, `SkillToolset`, skill
  evaluation).

---

## 1. System architecture

```mermaid
flowchart TB
  subgraph Client["Browser"]
    UI["Next.js App Router UI<br/>(manager + employee)"]
  end

  subgraph Web["Next.js server (TypeScript)"]
    API["Route handlers /api/*"]
    AUTH["Auth + RBAC + permissions<br/>(enforced BEFORE the model)"]
    SVC["Services: hris / survey / evidence /<br/>review / outbox / audit / export"]
    PRIV["Privacy filter (deterministic)<br/>PII redaction + minimization"]
    DB[("SQLite + Drizzle<br/>users, questionnaires, evidence,<br/>review_drafts, audit_logs ...")]
  end

  subgraph Agent["Python ADK 2.0 agent service (FastAPI)"]
    REST["REST endpoints<br/>/questionnaire /evidence /review"]
    WF["ADK Workflow graphs<br/>(nodes + edges + routing)"]
    SEC["Pre-LLM security node<br/>PII + prompt-injection screening"]
    GEM["Gemini (API key / Vertex)"]
    OTEL["OpenTelemetry traces"]
    SKILL["SkillToolset (skills/)"]
  end

  UI --> API --> AUTH --> SVC --> PRIV
  PRIV -- "minimized, authorized context (REST)" --> REST
  REST --> WF --> SEC --> GEM
  WF --> SKILL
  WF --> OTEL
  REST -- "structured result" --> SVC --> DB
  SVC --> UI
  OTEL -. "Cloud Trace / spans" .-> Obs[("Observability<br/>agent.session / think / tool")]
```

**Boundary rule (unchanged from the original design):** access control and
consent are enforced in the TypeScript app **before** any data reaches the agent
service. The service only ever receives already-authorized, minimized,
PII-redacted context. The LLM is never the authorization boundary.

### Why hybrid (TS frontend + Python agent service)
Google's current ADK best-practice stack — graph `Workflow`, `RequestInput`
HITL, `agents-cli` lifecycle (scaffold / playground / eval / deploy to Agent
Runtime) — ships in **Python ADK 2.0**. The TypeScript line (`@google/adk` 1.3)
is capable (`RoutedAgent`, `LongRunningFunctionTool`) but lacks the graph DSL and
Agent Runtime target. To maximize ADK depth while keeping the TS UI, the agent
brain is Python; the app stays TypeScript and calls it over REST.

---

## 2. Agent workflows (ADK 2.0 graphs)

Each agent is an ADK `Agent` with a Pydantic `input_schema`/`output_schema`;
agents are composed into graph `Workflow`s. Deterministic logic (security,
routing) lives in `@node` functions — "write software, not rules."

```mermaid
flowchart LR
  subgraph QW["Questionnaire workflow"]
    direction LR
    S1((START)) --> QA[questionnaire_agent] --> SA[safety_agent] --> QO[/QuestionnaireWithSafety/]
  end

  subgraph EW["Evidence workflow"]
    direction LR
    S2((START)) --> SN["security_node<br/>(PII redaction)"] --> EV[evidence_validator]
    EV --> FN{"finalize_node<br/>confidence ≥ 0.7?"}
    FN -- yes --> AS[/auto_approved/]
    FN -- no --> PR["pending_review<br/>(manager queue / RequestInput)"]
  end

  subgraph RW["Review workflow"]
    direction LR
    S3((START)) --> PF["privacy/security node"] --> RD[review_draft_agent] --> FG[fairness_grounding_agent] --> RO[/grounded review/]
  end
```

| Workflow | Nodes | Status |
| --- | --- | --- |
| Questionnaire | `questionnaire_agent → safety_agent` | ✅ working, validated vs Gemini |
| Evidence | `security_node → evidence_validator → finalize_node` (confidence routing) | 🟡 WIP (REST validation pending) |
| Review | `privacy_node → review_draft_agent → fairness_grounding_agent` | ⬜ to build |

### Main request flow (review generation)

```mermaid
sequenceDiagram
  participant M as Manager (UI)
  participant API as Next API
  participant Perm as Permissions
  participant RS as reviewService
  participant AS as Agent service (Python)
  participant G as Gemini

  M->>API: POST /api/reviews/generate {employeeId, period}
  API->>Perm: assertManagerCanViewEmployee()
  Perm-->>API: ok (else 403)
  API->>RS: generateReviewContext() — consent-gated evidence only
  RS->>RS: privacy filter (minimize + redact)
  RS->>AS: POST /review {sanitized context}
  AS->>AS: pre-LLM security node
  AS->>G: review_draft_agent → fairness_grounding_agent
  G-->>AS: grounded draft + fairness report
  AS-->>RS: structured result
  RS->>RS: save draft (status=draft); audit
  RS-->>M: draft + fairness warnings (manager approves/edits/exports)
```

---

## 3. Tools & services

| Layer | TypeScript app | Python agent service |
| --- | --- | --- |
| Tools | hris / survey / evidence / review / **privacy** facades | ADK `FunctionTool`s; `SkillToolset` for skills |
| Services own permission checks | yes (before model) | n/a (receives authorized context) |
| State | SQLite (Drizzle), local files (`data/exports`) | ADK session/state (graph), stateless REST |

---

## 4. Frameworks applied

### 4.1 Security — 7-Pillar mapping (FILE1)

| Pillar | ReviewOps today | Roadmap |
| --- | --- | --- |
| 1 Infra & networking | local dev; Cloud Run/Agent Runtime later | gVisor sandbox, egress governance |
| 2 Data | SQLite, consent gate, **PII redaction before model** | CMEK/mTLS, tenant partitioning |
| 3 Model | prompts as versioned constants; structured schemas | signed/attested prompt artifacts |
| 4 App & runtime | **no secrets in frontend**, RBAC, deterministic privacy filter, safety agent | LLM firewall, lifecycle hooks, MCP contextual auth |
| 5 IAM | mock session now; access checks before model | agentic identity (SPIFFE), JIT downscoping |
| 6 Observability & SecOps | audit log | **OpenTelemetry traces** (ADK built-in), ABA, red/blue/green |
| 7 Governance | audit trail; **HITL approval = "Vibe Diff" logic review** | EU AI Act impact assessment, attestation |

Notably already aligned: **access control before the model**, **pre-LLM PII
redaction**, **human-in-the-loop approval** (the whitepaper's "Vibe Diff" — show
the human plain-language intent→action before consent), and **no
prompt-based security**.

### 4.2 Evaluation (FILE1 dimensions × methods)

Relevant dimensions for ReviewOps (structured-output agents, not code-gen):
**intent satisfaction** (does the questionnaire/review match the request),
**functional correctness** (schema validity, evidence citations present),
**trajectory quality** (right nodes/tools in order), **safety/responsible-AI**
(safety agent + privacy filter), **cost/efficiency** (tokens/latency per flow).

Methods: `agents-cli eval` (golden datasets + **LLM-as-judge** with
position-swap + human calibration), **trajectory inspection** via OpenTelemetry,
TS Vitest for permissions/tokens/results. Apply the **Read → Draft → Act**
graduation and `pass^k` for action-allowed flows (e.g. auto-approving evidence).

### 4.3 Observability (FILE1)

ADK 2.0 + Agent Engine emit OpenTelemetry spans (`agent.session`, `agent.think`,
`agent.tool`) → **Cloud Trace**. The scaffolded service already wires
`setup_telemetry()`. We trace the per-request "trajectory", measure token cost,
and use tail-based sampling (keep error/high-correction traces).

### 4.4 Skills (FILE2)

Agents load **Skills** (folder + `SKILL.md` + scripts/references/assets,
progressive disclosure) via ADK **`SkillToolset`**. Candidate ReviewOps skills:
`drafting-performance-reviews`, `validating-evidence`,
`generating-evidence-surveys`, `fairness-grounding-check`. Each follows
**EDD** (3 JSON eval cases before the SKILL.md), a sharp `description` (trigger +
when-NOT), and the eval-coverage checklist (trigger / execution / regression /
token-budget). Skills compose with MCP (know-how vs reach), and deterministic
work lives in `scripts/`, not prose rules.

---

## 5. References
- Google (May 2026), *Vibe Coding Agent Security and Evaluation*.
- Google (May 2026), *Agent Skills*.
- ADK docs: https://adk.dev · agents-cli: https://google.github.io/agents-cli/
