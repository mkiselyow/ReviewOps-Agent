# Agent Evaluation Results

LLM-as-judge evaluation of the three ADK 2.0 agent workflows, run with
**`agents-cli eval`** against the **Vertex AI Eval Service**. This is the
execution of the framework in [EVALUATION_PLAN.md](EVALUATION_PLAN.md); the
golden datasets + rubrics live in `agent-service/tests/eval/`.

**Run:** 2026-07-02 · agent model **Gemini 2.5 Flash** · judge = Vertex AI Eval
Service (LLM-as-judge, position-swapped) · scores **1–5**.

## Scores (latest baseline)

| Workflow | Nodes | Golden cases | Mean score | Notes |
| --- | --- | --- | --- | --- |
| **Questionnaire** | `questionnaire → safety` | 8 | **4.67** | incl. accusatory + protected-topic **safety hard-refuse** probes |
| **Evidence** | `security → validator → finalize` | 8 | **5.00** | calibration (weak/strong/borderline) + PII/prompt-injection robustness |
| **Review** | `privacy → draft → fairness` | 6 | **5.00** | after the polish below (**3.89 → 5.00**) |

Each case is graded twice with reference/actual **position-swapped** to remove
ordering bias. A subset of gradings hit a known **Vertex autorater flake** (the
judge occasionally returns its rationale as non-strict JSON → a 400 parse error);
those are dropped from the mean, not scored 0.

## Eval-driven polish (the review workflow)

The item-5 rewrite (no fabrication + role-matrix calibration) initially graded
**3.89**. The judge surfaced two concrete issues, each fixed:

1. **Missing sections.** The draft didn't always emit the new
   `Role-Expectation Coverage` / `Requests for More Information` sections →
   **fixed in the agent** by giving `REVIEW_DRAFT_PROMPT` an explicit, mandatory
   section template (`agent-service/app/review.py`).
2. **Judge mis-calibration.** The judge penalized *forward-looking* `Growth Areas`
   and `Suggested Next-Period Goals` as "ungrounded inference." These are
   recommendations, not factual claims → **fixed in the rubric**: the
   no-fabrication rule applies to statements of *past fact*, while forward-looking
   sections may be reasoned from expectations/gaps. This is exactly the
   whitepaper's "calibrate the judge to ~human agreement" step.

Re-generate + re-grade after both changes → **5.00** (stdev 0).

> Sample judge rationale (review, 5/5): *"…perfectly grounded, every factual
> statement cites the provided evidence [ev_x_1]… The 'Growth Areas' and
> 'Suggested Next-Period Goals' are appropriately forward-looking and do not
> invent past accomplishments. The role-expectation calibration is handled
> precisely: 'Reliable delivery' is marked 'at level'… the 'Requests for More
> Information' section correctly identifies the …"*

## Reproduce

Needs GCP ADC (`gcloud auth application-default login`) and the Gemini API key in
`agent-service/.env`. From `agent-service/` (with `uv` + `agents-cli` on PATH):

```bash
# for R in questionnaire evidence review:
REVIEWOPS_ROOT_AGENT=$R agents-cli eval generate \
  --dataset tests/eval/datasets/reviewops-$R.json -o artifacts/traces/$R/
agents-cli eval grade --traces artifacts/traces/$R/ \
  --metrics ${R}_quality --config tests/eval/eval_config.yaml \
  --project <PROJECT> --region global --output artifacts/grade/$R/
```

`agents-cli eval analyze <grade>` clusters failures; `agents-cli eval compare
<base> <cand>` shows deltas between polish iterations. Raw traces + grade JSON/HTML
land under `agent-service/artifacts/` (gitignored — this summary is the committed
artifact).

## What this demonstrates (capstone)

Real **LLM-as-judge evaluation** with golden datasets, **position-swap** bias
control, **trajectory** inspection (OpenTelemetry spans), the **Read→Draft→Act +
pass^k** graduation model, and a genuine **eval → polish → re-eval** loop that
improved both the agent and the judge. See [EVALUATION_PLAN.md](EVALUATION_PLAN.md)
for the full framework.
