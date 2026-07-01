# Evaluation Datasets

This directory contains evaluation datasets for testing agent behavior.

## ReviewOps datasets (one per workflow)

| Dataset | Workflow | Grade with |
| --- | --- | --- |
| `reviewops-questionnaire.json` | questionnaire → safety | `--metrics questionnaire_quality` |
| `reviewops-evidence.json` | security → validator → finalize | `--metrics evidence_quality` |
| `reviewops-review.json` | privacy → draft → fairness | `--metrics review_quality` |

The questionnaire prompts are natural-language manager requests. The evidence and
review prompts are the **workflow input JSON as text** (the first node parses it),
so they exercise the same contract the REST endpoints use.

`agents-cli eval generate` runs the app's `root_agent`. Select which workflow it
points at with the **`REVIEWOPS_ROOT_AGENT`** env var
(`questionnaire` | `evidence` | `review`, default `questionnaire`) — no code edit
needed. Then grade with the matching `--metrics` rubric. Example:

```bash
# Questionnaire workflow
REVIEWOPS_ROOT_AGENT=questionnaire agents-cli eval generate \
  --dataset tests/eval/datasets/reviewops-questionnaire.json --output traces/questionnaire/
agents-cli eval grade --metrics questionnaire_quality --traces traces/questionnaire/

# Evidence workflow
REVIEWOPS_ROOT_AGENT=evidence agents-cli eval generate \
  --dataset tests/eval/datasets/reviewops-evidence.json --output traces/evidence/
agents-cli eval grade --metrics evidence_quality --traces traces/evidence/

# Review workflow
REVIEWOPS_ROOT_AGENT=review agents-cli eval generate \
  --dataset tests/eval/datasets/reviewops-review.json --output traces/review/
agents-cli eval grade --metrics review_quality --traces traces/review/
```

(Generate/grade use the Vertex AI Eval Service + GCS — see
docs/EVALUATION_PLAN.md §0.2. On PowerShell, set the env var with
`$env:REVIEWOPS_ROOT_AGENT="evidence"` before each command.)

## Running Evaluations

### Default Dataset
```bash
# Generate traces using the default dataset
agents-cli eval generate
agents-cli eval grade
```

### Custom Dataset
```bash
# Generate traces for a custom dataset
agents-cli eval generate --dataset tests/eval/datasets/custom-dataset.json --output custom_traces/
agents-cli eval grade --metrics general_quality --traces custom_traces/
```

## Dataset Format

Each dataset file follows the Gemini Enterprise Agent Platform Evaluation
dataset format. An eval case may use **either** of two shapes — both are
valid input to `agents-cli eval generate`:

**Shape A — single-prompt case:**

```json
{
  "eval_cases": [
    {
      "eval_case_id": "unique_case_id",
      "prompt": {
        "role": "user",
        "parts": [{"text": "User message"}]
      }
    }
  ]
}
```

**Shape B — continued-conversation case (the "N+1" pattern):**
The case carries prior turns in `agent_data` and the last turn ends with a
user message; `eval generate` appends the next agent response.

```json
{
  "eval_cases": [
    {
      "eval_case_id": "unique_case_id",
      "agent_data": {
        "turns": [
          {
            "turn_index": 0,
            "events": [
              {"author": "user",  "content": {"role": "user",  "parts": [{"text": "First user message"}]}},
              {"author": "agent", "content": {"role": "model", "parts": [{"text": "First agent reply"}]}},
              {"author": "user",  "content": {"role": "user",  "parts": [{"text": "Follow-up user message"}]}}
            ]
          }
        ]
      }
    }
  ]
}
```

## Key Fields

- `eval_cases`: Array of evaluation cases.
- `eval_case_id`: Unique identifier for the evaluation case (optional).
- `prompt`: A single user message — Shape A.
- `agent_data.turns`: Prior conversation turns ending with a user message — Shape B.

## Creating Custom Datasets

You can create custom datasets in two ways:

1. **By Hand**: Copy `basic-dataset.json` as a template and manually add evaluation cases.
2. **Synthesize**: Use the synthetic dataset generation command to generate conversation scenarios:
   ```bash
   agents-cli eval dataset synthesize --count 10
   ```

## Discovering Metrics

You can discover available out-of-the-box evaluation metrics by running:

```bash
agents-cli eval metric list
```

## Beyond Generate and Grade

Once you have a baseline, the eval surface has a few more commands worth knowing about:

- `agents-cli eval compare BASE CAND` — diff two grade-results files (regression check).
- `agents-cli eval analyze RESULTS` — cluster failure modes from a grade-results file.
- `agents-cli eval optimize` — auto-tune your agent's prompts using eval data.

See the [Evaluation Guide](https://google.github.io/agents-cli/guide/evaluation/) for the full surface and metric reference.
