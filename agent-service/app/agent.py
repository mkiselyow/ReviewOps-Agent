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

import os

# API-key mode (Google AI Studio). google-genai reads GOOGLE_API_KEY from the
# environment / .env when Vertex AI is disabled.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.adk.workflow import Workflow
from google.genai import types

from .schemas import QuestionnaireOutput, QuestionnaireWithSafety

QUESTIONNAIRE_PROMPT = """You are the Questionnaire Agent for an engineering
performance-evidence tool. From the manager's request (topic, period, purpose),
produce a SHORT work-evidence questionnaire.

Rules:
- 5 to 7 questions only.
- Strictly work-related; never ask about health, family, politics, religion,
  nationality, private life, salary, or immigration.
- Collect concrete examples, measurable impact, and links/artifacts as evidence.
- Prefer long_text and evidence_link question types for the core questions.
- Give each question a one-sentence explanation of why it is asked.
- Default privacy_mode to "named_review_evidence".
Return only the structured questionnaire."""

SAFETY_PROMPT = """You are the Questionnaire Safety Agent. You receive a
generated questionnaire. Review every question and decide whether it is safe to
send.

Flag a question as risky if it touches health, family, politics, religion,
nationality, private life, salary, or immigration, or if it is manipulative,
accusatory, or leading; for each risky question give a safer alternative.
Set decision to "needs_revision" if any question is risky, else "approved".

Return the questionnaire UNCHANGED in the `questionnaire` field, and your review
in the `safety` field."""


def _model() -> Gemini:
    return Gemini(
        model=os.environ.get("GEMINI_MODEL", "gemini-flash-latest"),
        retry_options=types.HttpRetryOptions(attempts=3),
    )


questionnaire_agent = Agent(
    name="questionnaire_agent",
    model=_model(),
    instruction=QUESTIONNAIRE_PROMPT,
    output_schema=QuestionnaireOutput,
    mode="single_turn",
)

safety_agent = Agent(
    name="safety_agent",
    model=_model(),
    instruction=SAFETY_PROMPT,
    input_schema=QuestionnaireOutput,
    output_schema=QuestionnaireWithSafety,
    mode="single_turn",
)

questionnaire_workflow = Workflow(
    name="questionnaire_workflow",
    edges=[("START", questionnaire_agent, safety_agent)],
)

# root_agent for the playground/agents-cli is the validated questionnaire
# workflow. The evidence workflow (app/evidence.py) is WIP: it runs without
# error but its terminal function-node output is not surfaced by `agents-cli
# run` (which renders only the final agent response). It will be validated via
# the REST endpoint / playground, where the function-node Event(output=...) is
# read programmatically.
root_agent = questionnaire_workflow

app = App(
    root_agent=root_agent,
    name="app",
)
