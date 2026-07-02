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

from .schemas import QuestionnaireOutput, QuestionnaireWithSafety, SafetyReport

QUESTIONNAIRE_PROMPT = """You are the Questionnaire Agent for an engineering
performance-evidence tool. You receive a JSON request with the manager's intent:
`topic`, `period`, `purpose`, `notes` (free-form, may contain a detailed spec),
optional role/company context, and `require_evidence` (a boolean).

Your job is to turn the manager's request into a questionnaire that FAITHFULLY
reflects what they asked for. The structure is dynamic — let the manager's input
drive it. Do NOT impose a fixed length or format.

DYNAMIC STRUCTURE — when the manager describes explicit structure, reproduce it
exactly; do not summarize, merge, or drop items:
- A list of items (e.g. skills, competencies, projects) -> emit ONE question per
  item. 34 skills means 34 questions, not a few summarizing ones.
- A rating scale or levels (e.g. "L1 Awareness ... L5 Expert") -> use
  question_type "single_choice" and put only the SHORT level LABELS in `options`,
  in order (e.g. "L1 - Awareness", "L2 - Working Knowledge", ...). If the manager
  says the default is empty / NA / "not familiar", make the FIRST option that
  (e.g. "— (not familiar / NA)"). Do NOT repeat the long level descriptions in
  every question — instead, list the scale ONCE in `scale_legend` as
  {label, description} entries (label must match the option label). Reuse the
  same short labels across every question that uses that scale.
- Named groups/sections -> set `section` to the group name on every question that
  belongs to it.
- Opt-in / conditional reveal ("answer yes to show this section's questions")
  -> add exactly ONE gate question at the start of that section with
  `opt_in: true`, question_type "single_choice", options ["Yes", "No"], and the
  same `section`; the other questions in that section depend on it.

FALLBACK — when the manager gives NO explicit structure, produce a short
work-evidence survey of 5-7 `long_text` questions that collect concrete examples,
measurable impact, and ownership/collaboration signals.

EVIDENCE:
- Read `require_evidence` from the request JSON.
- Only when it is true, set `evidence_required: true` on the OPEN/narrative
  questions (long_text/short_text) where a supporting link or artifact is
  meaningful. Evidence is an ATTRIBUTE of a question.
- NEVER create a separate "paste a link" / evidence_link question, and never put
  evidence demands on level/choice questions.
- When `require_evidence` is false, set `evidence_required: false` everywhere.

QUESTION TYPES — pick the one that matches the answer shape:
- long_text / short_text: free-text narrative.
- single_choice / multi_choice / rating: pick-from-options (put choices in
  `options`).
- number: a numeric value (counts, metrics). date: a calendar date.
  email: an email address. (These take NO options and NEVER take evidence.)
- evidence_link / attachment: only if the manager explicitly wants a raw link or
  file field — prefer evidence_required on a text question instead.

REFUSAL (safety) — check the request FIRST:
- If the request is DOMINATED by protected/sensitive topics (its main purpose is
  to ask about health, family/marriage, religion, politics, nationality, private
  life, salary, or immigration), DO NOT generate substitute questions. Instead
  set `refused: true`, leave `questions` EMPTY, and write `refusal_reason`
  naming the prohibited topics that were requested, stating they can't be used to
  assess performance, and suggesting a lawful work-related reframing.
- If the request is mostly legitimate but mentions a sensitive topic in passing,
  generate normally and simply exclude the sensitive part (do NOT refuse).

ALWAYS (when not refusing):
- Strictly work-related; never ask about health, family, politics, religion,
  nationality, private life, salary, or immigration.
- For a per-item matrix question, the `text` is just the item (e.g. the skill
  name); the levels live in `options`. Keep it concise.
- Give each question a one-sentence `explanation` — ONE short sentence, never a
  paragraph. Never repeat the scale level descriptions inside a question (they
  live once in `scale_legend`). Keep every field terse; even for many items the
  output must stay compact.
- Number `position` from 1 upward in display order (gates before their section's
  items).
- Default privacy_mode to "named_review_evidence".
Return only the structured questionnaire."""

SAFETY_PROMPT = """You are the Questionnaire Safety Agent. You receive a
generated questionnaire (with numbered `position`s). Review every question and
return ONLY a safety verdict — do NOT echo the questionnaire back.

Flag a question as risky if it touches health, family, politics, religion,
nationality, private life, salary, or immigration, or if it is manipulative,
accusatory, or leading. For each risky question add a `risky_questions` entry with
its `position`, the `reason`, and a `safer_alternative`. Set `decision` to
"needs_revision" if any question is risky, else "approved".

If the questionnaire is REFUSED (`refused: true` / empty `questions`), the
manager's request asked for prohibited topics — set `decision` to
"needs_revision" and put the `refusal_reason` in `notes`. Do NOT report
"approved": a refusal must be surfaced, never laundered into an all-clear.

Output only the SafetyReport (decision, risky_questions, notes). The app keeps the
original questionnaire and pairs it with your verdict."""


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
    # attempts=1: a too-large questionnaire truncates deterministically, so
    # retrying only multiplies latency. Raise the output ceiling so large skill
    # matrices fit in a single pass.
    model=_model(attempts=1),
    instruction=QUESTIONNAIRE_PROMPT,
    output_schema=QuestionnaireOutput,
    generate_content_config=types.GenerateContentConfig(max_output_tokens=32768),
    mode="single_turn",
)

safety_agent = Agent(
    name="safety_agent",
    model=_model(),
    instruction=SAFETY_PROMPT,
    input_schema=QuestionnaireOutput,
    # Verdict ONLY — the questionnaire is threaded via state and re-attached by
    # assemble_node, so the (possibly large) questionnaire JSON is emitted once.
    output_schema=SafetyReport,
    mode="single_turn",
)


@node
async def capture_node(node_input: Any):
    """Parse the questionnaire, stash it in state, and pass it to the safety
    agent as input. Keeps the big JSON out of the safety agent's OUTPUT."""
    q = QuestionnaireOutput(**_load_json(node_input))
    data = q.model_dump()
    yield Event(output=data, state={"questionnaire": data})


@node
async def assemble_node(node_input: Any, questionnaire: Any = None):
    """Pair the state-threaded questionnaire with the safety verdict into the
    terminal QuestionnaireWithSafety (unchanged REST contract)."""
    safety = SafetyReport(**_load_json(node_input))
    q = QuestionnaireOutput(**(questionnaire or {}))
    yield Event(output=QuestionnaireWithSafety(questionnaire=q, safety=safety).model_dump())


questionnaire_workflow = Workflow(
    name="questionnaire_workflow",
    edges=[("START", questionnaire_agent, capture_node, safety_agent, assemble_node)],
)

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
