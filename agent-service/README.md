# agent-service

The Python half of ReviewOps Agent: a FastAPI service hosting **three ADK 2.0
graph `Workflow`s** (Gemini) behind a small REST surface. The TypeScript app
enforces access control, consent, and PII minimization *before* calling this
service — see [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full
security model and workflow diagrams.

Scaffolded with `agents-cli` 0.6.0, then rebuilt around structured workflows.

## The three workflows

| Workflow | File | Graph |
|----------|------|-------|
| **Questionnaire** | `app/agent.py` | `questionnaire_agent → capture → safety_agent → deterministic expand` — generates a compact plan, reviews items for sensitive/leading topics, then expands to the full questionnaire without a second LLM pass |
| **Evidence** | `app/evidence.py` | `security_node (PII + injection screen) → evidence_validator → confidence-gated finalize` — scores evidence quality, routes low-confidence items to human review |
| **Review** | `app/review.py` | `privacy_node → review_draft_agent (SkillToolset) → deterministic fairness check` — drafts a review grounded only in approved evidence, every claim cited |

The review agent loads the **`drafting-performance-reviews` skill**
(`skills/drafting-performance-reviews/` — `SKILL.md`, grounding rules, and 3
eval cases) via ADK `SkillToolset`.

## Project structure

```
agent-service/
├── app/
│   ├── agent.py         # Questionnaire workflow
│   ├── evidence.py      # Evidence validation workflow
│   ├── review.py        # Review drafting workflow (+ SkillToolset)
│   ├── schemas.py       # Pydantic I/O schemas for all workflows
│   ├── security.py      # Pre-LLM PII redaction + prompt-injection screening
│   ├── local_server.py  # Local/Cloud Run FastAPI entry point
│   ├── fast_api_app.py  # Agent Runtime entry point (telemetry wiring)
│   └── app_utils/       # A2A, telemetry, service helpers
├── skills/
│   └── drafting-performance-reviews/   # SKILL.md + references + evals
├── tests/
│   ├── integration/     # Agent stream tests
│   └── eval/            # Golden datasets + eval_config.yaml (LLM-as-judge)
├── Dockerfile           # Cloud Run image
└── pyproject.toml
```

## Requirements

- **uv** — Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/))
- **agents-cli** — `uv tool install google-agents-cli`
- A Gemini API key (`GOOGLE_API_KEY`) or Vertex AI credentials

## Run locally

```bash
agents-cli install                                # install deps via uv
uvicorn app.local_server:app --port 8800          # serve the workflows
```

The Next.js app talks to this service at `AGENT_SERVICE_URL`
(default `http://127.0.0.1:8800`). Requests are authenticated with the
`X-Agent-Key` header (`AGENT_SHARED_SECRET`, shared with the frontend).

Environment variables (see `.env`, gitignored):

| Variable | Purpose |
|----------|---------|
| `GOOGLE_API_KEY` | Gemini key for local dev (prod uses Vertex mode via ADC — no key in the image) |
| `GEMINI_MODEL` | Model id, default `gemini-2.5-flash` |
| `AGENT_SHARED_SECRET` | Shared secret checked on every request |

## Evaluate

```bash
agents-cli eval generate --dataset tests/eval/datasets/reviewops-questionnaire.json --metrics questionnaire_quality
BASE=http://127.0.0.1:8800 python tests/eval/structural_smoke.py   # needs a funded key
uv run pytest tests/unit tests/integration
```

Three LLM-as-judge metrics (`tests/eval/eval_config.yaml`) score
questionnaire, evidence, and review quality against golden datasets — results
and the eval-driven fixes they produced are in
[docs/EVAL_RESULTS.md](../docs/EVAL_RESULTS.md).

## Deploy

Built as a container (see `Dockerfile`) and deployed to **Cloud Run** in
Vertex mode — no API key baked into the image. Step-by-step reproduction in
[docs/DEPLOY.md](../docs/DEPLOY.md). Telemetry exports to Cloud Trace via
OpenTelemetry (`app/app_utils/telemetry.py`).
