# ruff: noqa
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# See the License for the specific language governing permissions and
# limitations under the License.

"""ReviewOps agent service — vertical slice: questionnaire -> safety.

A two-node ADK 2.0 graph Workflow:
  START -> questionnaire_agent -> safety_agent

The questionnaire agent generates a 5-7 question work-evidence survey; the
safety agent reviews it for sensitive/leading questions and returns the
questionnaire together with its safety verdict.
"""

import json
import os
from typing import Any

# API-key mode (Google AI Studio). google-genai reads GOOGLE_API_KEY from the
# environment / .env when Vertex AI is disabled.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.events import Event
from google.adk.models import Gemini
from google.adk.workflow import Workflow, node
from google.genai import types

from .schemas import (
    GeneratedQuestion,
    QuestionnaireOutput,
    QuestionnairePlan,
    QuestionnaireWithSafety,
    SafetyReport,
)

QUESTIONNAIRE_PROMPT = """You are the Questionnaire Agent for an engineering
performance-evidence tool. You receive a JSON request with the manager's intent:
`topic`, `period`, `purpose`, `notes` (free-form, may contain a detailed spec),
optional role/company context, and `require_evidence` (a boolean).

Output a COMPACT PLAN (QuestionnairePlan), NOT expanded questions. List each
question ONCE as an `items` entry. If there is a rating scale, list it ONCE in
`scale_legend` and set `uses_scale: true` on the items rated on it — do NOT repeat
options or level descriptions per item. Code expands the plan into the final
questionnaire, so keeping the plan small is essential (a big matrix must stay
compact).

DYNAMIC STRUCTURE — reproduce what the manager describes; never summarize, merge,
or drop items:
- A list of items (skills/competencies/projects) → ONE `items` entry per item
  (its `text` is the item name). 34 skills = 34 items, not a few summarizing ones.
- A rating scale / levels (e.g. "L1 Awareness … L5 Expert") → put the SHORT level
  LABELS once in `scale_legend` as {label, description}; set `uses_scale: true` on
  every item rated on it. If the manager says the default is empty / NA / "not
  familiar", make that the FIRST scale label.
- Named groups/sections → set `section` on each item in the group.
- Opt-in / conditional reveal ("answer yes to show this section") → add exactly
  ONE item at the START of that section with `opt_in: true` and the same
  `section` (code turns it into a Yes/No gate).

FALLBACK — no explicit structure → 5–7 `items` with `type: "long_text"` and
`uses_scale: false`, collecting concrete examples, measurable impact, and
ownership/collaboration signals.

EVIDENCE — read `require_evidence`. When true, set `evidence_required: true` ONLY
on open/narrative items (`type` long_text/short_text) where a link/artifact is
meaningful — never on scale, choice, number, date, or email items. When false,
leave it false everywhere.

ITEM `type` (used only when `uses_scale` is false and it is not an opt-in gate):
long_text / short_text (free text), number, date, email. Prefer
`evidence_required` on a text item over a raw link field.

REFUSAL (safety) — check the request FIRST:
- If the request is DOMINATED by protected/sensitive topics (its main purpose is
  health, family/marriage, religion, politics, nationality, private life, salary,
  or immigration), set `refused: true`, leave `items` EMPTY, and write
  `refusal_reason` naming the prohibited topics and a lawful work-related
  reframing.
- If a legitimate request only mentions a sensitive topic in passing, generate
  normally and simply omit that part (do NOT refuse).

ALWAYS (when not refusing):
- Strictly work-related; never ask about health, family, politics, religion,
  nationality, private life, salary, or immigration.
- Each item's `explanation` is ONE short sentence (may be empty for matrix cells —
  the scale legend explains). Keep every field terse; the plan must stay compact
  even for many items.
- Default privacy_mode to "named_review_evidence".
Return only the plan."""

SAFETY_PROMPT = """You are the Questionnaire Safety Agent. You receive a
questionnaire PLAN — a list of `items` (0-indexed in order). Review each item's
`text` and return ONLY a safety verdict — do NOT echo the plan back.

Flag an item as risky if it touches health, family, politics, religion,
nationality, private life, salary, or immigration, or if it is manipulative,
accusatory, or leading. For each risky item add a `risky_questions` entry with its
`position` (its index in `items`), the `reason`, and a `safer_alternative`. Set
`decision` to "needs_revision" if any item is risky, else "approved".

If the plan is REFUSED (`refused: true` / empty `items`), the manager's request
asked for prohibited topics — set `decision` to "needs_revision" and put the
`refusal_reason` in `notes`. Do NOT report "approved": a refusal must be surfaced,
never laundered into an all-clear.

Output only the SafetyReport (decision, risky_questions, notes). The app keeps the
questionnaire and pairs it with your verdict."""


def _model(attempts: int = 3) -> Gemini:
    return Gemini(
        model=os.environ.get("GEMINI_MODEL", "gemini-flash-latest"),
        retry_options=types.HttpRetryOptions(attempts=attempts),
    )


def _to_text(node_input: Any) -> str:
    if node_input is None:
        return "{}"
    if isinstance(node_input, str):
        return node_input
    parts = getattr(node_input, "parts", None)
    if parts:
        return "".join(getattr(p, "text", "") or "" for p in parts)
    if hasattr(node_input, "model_dump_json"):
        return node_input.model_dump_json()
    if isinstance(node_input, dict):
        if "parts" in node_input and isinstance(node_input["parts"], list):
            return "".join((p or {}).get("text", "") or "" for p in node_input["parts"])
        return json.dumps(node_input)
    return str(node_input)


def _load_json(node_input: Any) -> dict:
    return json.loads(_to_text(node_input).strip())


questionnaire_agent = Agent(
    name="questionnaire_agent",
    # Emits a COMPACT plan (items listed once + one scale), not expanded
    # questions — so a big matrix stays small/fast and never truncates. attempts=1
    # (a size problem is deterministic); ample output ceiling as a safety margin.
    model=_model(attempts=1),
    instruction=QUESTIONNAIRE_PROMPT,
    output_schema=QuestionnairePlan,
    generate_content_config=types.GenerateContentConfig(max_output_tokens=32768),
    mode="single_turn",
)

safety_agent = Agent(
    name="safety_agent",
    model=_model(),
    instruction=SAFETY_PROMPT,
    input_schema=QuestionnairePlan,
    # Verdict ONLY — the plan is threaded via state and expanded by expand_node.
    output_schema=SafetyReport,
    mode="single_turn",
)


@node
async def capture_node(node_input: Any):
    """Parse the compact plan, stash it in state, and pass it to the safety agent
    (which reviews the item texts and returns just a verdict)."""
    plan = QuestionnairePlan(**_load_json(node_input))
    data = plan.model_dump()
    yield Event(output=data, state={"plan": data})


def _expand_plan(plan: QuestionnairePlan) -> QuestionnaireOutput:
    """Deterministically turn the compact plan into the full questionnaire:
    one question per item, the shared scale stamped onto matrix items, opt-in
    gates as Yes/No single_choice. No LLM, no per-item cost — so arbitrarily
    large matrices expand instantly."""
    labels = [lvl.label for lvl in plan.scale_legend]
    questions: list[GeneratedQuestion] = []
    for i, item in enumerate(plan.items):
        if item.opt_in:
            qtype, options = "single_choice", ["Yes", "No"]
        elif item.uses_scale and labels:
            qtype, options = "single_choice", labels
        else:
            qtype, options = item.type, []
        free_text = qtype in ("long_text", "short_text")
        questions.append(
            GeneratedQuestion(
                position=i,
                question_type=qtype,
                text=item.text,
                options=options,
                explanation=item.explanation,
                required=True,
                evidence_required=item.evidence_required and free_text,
                section=item.section,
                opt_in=item.opt_in,
            )
        )
    return QuestionnaireOutput(
        title=plan.title,
        purpose=plan.purpose,
        privacy_mode=plan.privacy_mode,
        refused=plan.refused,
        refusal_reason=plan.refusal_reason,
        scale_legend=plan.scale_legend,
        questions=questions,
    )


@node
async def expand_node(node_input: Any, plan: Any = None):
    """Expand the state-threaded plan and pair it with the safety verdict into the
    terminal QuestionnaireWithSafety (unchanged REST contract)."""
    safety = SafetyReport(**_load_json(node_input))
    questionnaire = _expand_plan(QuestionnairePlan(**(plan or {})))
    yield Event(
        output=QuestionnaireWithSafety(questionnaire=questionnaire, safety=safety).model_dump()
    )


questionnaire_workflow = Workflow(
    name="questionnaire_workflow",
    edges=[("START", questionnaire_agent, capture_node, safety_agent, expand_node)],
)


# --- Decomposed workflows for CHUNKED generation ----------------------------
# For a very large questionnaire, local_server splits the input into chunks and
# runs plan generation per chunk (in parallel), merges the plans, runs safety
# once, then expands. These single-node workflows expose the two LLM steps;
# `expand_plan` is the deterministic expansion reused on the merged plan.
plan_workflow = Workflow(
    name="questionnaire_plan_workflow",
    edges=[("START", questionnaire_agent)],
)

safety_workflow = Workflow(
    name="questionnaire_safety_workflow",
    edges=[("START", safety_agent)],
)


def expand_plan(plan: QuestionnairePlan) -> QuestionnaireOutput:
    """Public wrapper over the deterministic plan → questionnaire expansion."""
    return _expand_plan(plan)

# root_agent for the playground / agents-cli (incl. `agents-cli eval generate`)
# is selectable via env so each workflow can be evaluated against its own golden
# dataset without code edits:
#   REVIEWOPS_ROOT_AGENT=questionnaire | evidence | review   (default: questionnaire)
# The local REST server (app/local_server.py) is unaffected — it always serves
# all three workflows at their own endpoints.
from .evidence import evidence_workflow
from .review import review_workflow

_WORKFLOWS = {
    "questionnaire": questionnaire_workflow,
    "evidence": evidence_workflow,
    "review": review_workflow,
}
_ROOT = os.environ.get("REVIEWOPS_ROOT_AGENT", "questionnaire").strip().lower()
root_agent = _WORKFLOWS.get(_ROOT, questionnaire_workflow)

app = App(
    root_agent=root_agent,
    name="app",
)
