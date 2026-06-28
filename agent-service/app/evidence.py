# ruff: noqa
"""Evidence-validation workflow (ADK 2.0 graph).

START -> security_node -> evidence_validator -> finalize_node

- security_node: deterministic pre-LLM PII redaction (never depends on the model)
- evidence_validator: LLM judgment, structured EvidenceValidation output
- finalize_node: deterministic confidence-gated routing (auto_approved vs
  pending_review) computed in code, not by the model
"""

import json
import os
import re
from typing import Any

from google.adk.agents import Agent
from google.adk.events import Event
from google.adk.models import Gemini
from google.adk.workflow import Workflow, node
from google.genai import types

from .schemas import (
    EvidenceInput,
    EvidenceMapped,
    EvidenceResult,
    EvidenceValidation,
)

CONFIDENCE_THRESHOLD = 0.7

_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")


def _redact(text: str) -> tuple[str, list[str]]:
    removed: list[str] = []
    out = text
    if _EMAIL_RE.search(out):
        removed.append("email")
        out = _EMAIL_RE.sub("[redacted-email]", out)
    if _PHONE_RE.search(out):
        removed.append("phone")
        out = _PHONE_RE.sub("[redacted-phone]", out)
    return out, removed


def _to_text(node_input: Any) -> str:
    """Coerce a node input (str / Content / dict / BaseModel) to a JSON/text string.

    Order matters: a Content message has BOTH `.parts` and `.model_dump_json`, so
    extract its inner text first rather than serializing the whole envelope.
    """
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
    text = _to_text(node_input).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback: treat the raw text as the answer.
        return {"answer_text": text}


@node
async def security_node(node_input: Any):
    data = _load_json(node_input)
    ev = EvidenceInput(**data)
    ev.answer_text, removed = _redact(ev.answer_text)
    # Pass the sanitized, structured input on to the validator agent as a dict
    # (the next node validates it against its input_schema).
    yield Event(output=ev.model_dump(), state={"pii_removed": removed})


VALIDATOR_PROMPT = """You are the Evidence Validator Agent. Given an employee's
answer plus the question, period, role expectations, and company values, judge
whether the answer works as performance evidence.

Score each dimension 0..1: specificity, impact, source_support, relevance,
time_clarity, review_usability. Produce an overall quality_score (0..1) and a
separate confidence (0..1) in your assessment. Extract a concise summary and the
impact, and map to the single most relevant company value (mapped_value). List
missing_fields. Set is_weak true when quality_score < 0.6, and in that case
provide ONE concrete follow_up_question asking for an example, who benefited,
what changed, and a supporting link or artifact."""

evidence_validator = Agent(
    name="evidence_validator",
    model=Gemini(model=os.environ.get("GEMINI_MODEL", "gemini-flash-latest"),
                 retry_options=types.HttpRetryOptions(attempts=3)),
    instruction=VALIDATOR_PROMPT,
    input_schema=EvidenceInput,
    output_schema=EvidenceValidation,
    mode="single_turn",
)


@node
async def finalize_node(node_input: Any):
    data = _load_json(node_input)
    val = EvidenceValidation(**data)
    if val.confidence >= CONFIDENCE_THRESHOLD and not val.is_weak:
        status = "auto_approved"
        reason = f"confidence {val.confidence:.2f} >= {CONFIDENCE_THRESHOLD} and not weak"
    else:
        status = "pending_review"
        reason = (
            f"confidence {val.confidence:.2f} < {CONFIDENCE_THRESHOLD} or weak "
            f"-> manager review"
        )
    mapped = EvidenceMapped(
        validation=val,
        company_value=val.mapped_value,
        goal=None,
        role_expectation=None,
        map_confidence=val.confidence,
    )
    result = EvidenceResult(mapped=mapped, status=status, routed_reason=reason)
    # Terminal structured output (dict) consumed by the REST caller.
    yield Event(output=result.model_dump())


evidence_workflow = Workflow(
    name="evidence_workflow",
    edges=[("START", security_node, evidence_validator, finalize_node)],
)
