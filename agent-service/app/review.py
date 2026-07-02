# ruff: noqa
"""Review-generation workflow (ADK 2.0 graph).

START -> privacy_node -> review_draft_agent -> fairness_node

- privacy_node: deterministic defense-in-depth PII redaction of the (already
  app-minimized) context; threads the valid evidence ids via workflow state.
- review_draft_agent: LLM draft, grounded ONLY in the provided evidence, citing
  evidence ids. Emits the body (the app adds the employee-name heading).
- fairness_node: deterministic grounding/fairness checks ("write software, not
  rules") — unsupported claims, vague praise/criticism, compensation language,
  sensitive data, source imbalance.
"""

import json
import os
import re
from pathlib import Path
from typing import Any

from google.adk.agents import Agent
from google.adk.events import Event
from google.adk.models import Gemini
from google.adk.skills import load_skill_from_dir
from google.adk.tools.skill_toolset import SkillToolset
from google.adk.workflow import Workflow, node
from google.genai import types

_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
_drafting_skill_toolset = SkillToolset(
    skills=[load_skill_from_dir(str(_SKILLS_DIR / "drafting-performance-reviews"))]
)

from .schemas import (
    FairnessReport,
    FairnessWarning,
    ReviewContextInput,
    ReviewDraftOutput,
    ReviewResult,
)
from .security import sanitize

_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
# Evidence ids may be slugs (ev_anna_1), UUIDs (with hyphens), or connector
# signals with a source prefix (peer:pr_anna_1, fb:..., 1on1:...).
_CITATION_RE = re.compile(r"\[([a-z0-9_:-]+)\]", re.I)
_VAGUE_PRAISE_RE = re.compile(
    r"\b(great|excellent|amazing|awesome|fantastic|rockstar|10x|good job|very good)\b", re.I
)
_VAGUE_CRITICISM_RE = re.compile(
    r"\b(not good|bad|weak|poor|disappointing|needs improvement)\b", re.I
)
# Whole-word so "pipeline" doesn't trip "pip", etc.
_COMP_RE = re.compile(
    r"\b(promotion|promote|promoted|bonus|salary|compensation|ranking|rank|pip|demotion|demote|termination|terminate|fired)\b",
    re.I,
)


def _redact(text: str) -> str:
    if not text:
        return text
    text = _EMAIL_RE.sub("[redacted-email]", text)
    text = _PHONE_RE.sub("[redacted-phone]", text)
    return text


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
    try:
        return json.loads(_to_text(node_input).strip())
    except json.JSONDecodeError:
        return {}


@node
async def privacy_node(node_input: Any):
    data = _load_json(node_input)
    ctx = ReviewContextInput(**data)
    for e in ctx.evidence:
        e.summary, _ = sanitize(e.summary)
        if e.impact:
            e.impact, _ = sanitize(e.impact)
    evidence_ids = [e.id for e in ctx.evidence]
    yield Event(output=ctx.model_dump(), state={"evidence_ids": evidence_ids})


REVIEW_DRAFT_PROMPT = """You are the Review Draft Agent. Using ONLY the provided
context (role, period, goals, role expectations, company values, and approved
evidence cards + external signals, each with an id), write a fair, factual
interim/annual review draft in Markdown.

GROUNDING — non-negotiable:
- Use ONLY the provided evidence/signals. NEVER invent, infer, guess, or
  embellish an accomplishment, metric, tool, or detail. If it was not provided,
  it does not go in the review.
- Every achievement/claim cites evidence ids like [ev_x] (or [peer:...],
  [fb:...], [1on1:...] for external signals). No citation → delete the statement.
- Do NOT sweeten. No praise without a cited fact. Be balanced and honest; a fair
  review based on raw facts is the goal, not a flattering one.

CALIBRATE AGAINST ROLE EXPECTATIONS (the role matrix):
- Judge each contribution AGAINST the listed role expectations, not in the
  abstract. Meeting an expectation is "at level / as expected" — NOT exceptional.
- Call something "above level" ONLY when the evidence clearly and measurably
  exceeds the stated expectation.
- Evidence that falls short of the expected level = "developing toward level".
- If an expectation has NO supporting evidence or signal, mark it
  "not yet evidenced" and add a concrete request for more information. Do NOT
  assume it was met and do NOT fill the gap with invention.
- Read external signals (peer reviews, feedback, 1:1 notes) through the SAME
  expectations: a specific remark mapping to an expectation is evidence the person
  meets it (at level). Vague positive feedback counts only as an attitude /
  collaboration signal (colleagues are glad to work with them), never as an
  achievement on its own.

Sections, in this exact order:
- `Summary` — short, fair overview; no unsupported superlatives.
- `Role-Expectation Coverage` — ONE bullet per role expectation, each formatted
  `- <expectation>: <at level | above level | developing toward level | not yet evidenced>`
  with a [citation] whenever it is evidenced.
- `Achievements` — bullets, each with at least one [citation].
- `Evidence-Backed Examples` — brief specifics tied to ids.
- `Growth Areas` — tied to expectations, framed as next steps (not personal criticism).
- `Requests for More Information` — expectations that are not yet evidenced and what
  to collect (include only if there are gaps).
- `Suggested Next-Period Goals`.
- `Evidence References` — each cited id with its summary.

You MUST include EVERY section header below, in this exact order, even when a
section is empty (then write "None."). `Role-Expectation Coverage` is REQUIRED and
must contain exactly one bullet per role expectation provided. Use these literal
Markdown headers:

## Summary
## Role-Expectation Coverage
## Achievements
## Evidence-Backed Examples
## Growth Areas
## Requests for More Information
## Suggested Next-Period Goals
## Evidence References

Do NOT discuss compensation, promotion, ranking, or sensitive personal data.
Do NOT include the employee's name (the app adds the heading).
Set evidence_references to the ids you cited.
Return ONLY the JSON object for the schema (the review text goes in the
`markdown` field). Do NOT wrap your whole response in a ```markdown code fence."""

review_draft_agent = Agent(
    name="review_draft_agent",
    model=Gemini(model=os.environ.get("GEMINI_MODEL", "gemini-flash-latest"),
                 retry_options=types.HttpRetryOptions(attempts=3)),
    instruction=REVIEW_DRAFT_PROMPT
    + "\n\nThe 'drafting-performance-reviews' skill holds the detailed grounding"
    " and formatting rules — load it before writing.",
    input_schema=ReviewContextInput,
    output_schema=ReviewDraftOutput,
    mode="single_turn",
    tools=[_drafting_skill_toolset],
)


def _section_bullets(markdown: str, heading: str) -> list[str]:
    out: list[str] = []
    in_section = False
    for line in markdown.split("\n"):
        h = re.match(r"^##\s+(.*)$", line)
        if h:
            in_section = h.group(1).strip().lower() == heading.lower()
            continue
        if in_section:
            out.append(line)
    return out


@node
async def fairness_node(node_input: Any, evidence_ids: Any = None):
    data = _load_json(node_input)
    draft = ReviewDraftOutput(**data)
    markdown = draft.markdown
    valid_ids = set(evidence_ids or [])

    warnings: list[FairnessWarning] = []

    # Cited evidence ids that exist in the approved set (if we know the set).
    cited = set()
    for m in _CITATION_RE.finditer(markdown):
        if not valid_ids or m.group(1) in valid_ids:
            cited.add(m.group(1))

    # Unsupported claims: achievement bullets without a citation.
    unsupported = 0
    for line in _section_bullets(markdown, "Achievements"):
        if re.match(r"^[-*]\s+\S", line) and not re.search(r"_no ", line, re.I):
            if not _CITATION_RE.search(line):
                unsupported += 1
                warnings.append(FairnessWarning(
                    type="unsupported_claim",
                    message=f'Claim has no evidence citation: "{re.sub(r"^[-*]\\s+", "", line)[:80]}"',
                    severity="high",
                ))

    if _VAGUE_PRAISE_RE.search(markdown):
        warnings.append(FairnessWarning(type="vague_praise",
            message="Contains vague praise; replace with specific, evidence-backed statements.",
            severity="medium"))
    if _VAGUE_CRITICISM_RE.search(markdown):
        warnings.append(FairnessWarning(type="vague_criticism",
            message="Contains vague criticism; tie feedback to concrete evidence.",
            severity="medium"))
    if _COMP_RE.search(markdown):
        warnings.append(FairnessWarning(type="compensation_language",
            message="Contains compensation/promotion/ranking language, which is out of scope.",
            severity="high"))
    if _EMAIL_RE.search(markdown) or _PHONE_RE.search(markdown):
        warnings.append(FairnessWarning(type="sensitive_data",
            message="Possible sensitive personal data detected.", severity="high"))
    if 0 < len(cited) < 2:
        warnings.append(FairnessWarning(type="source_imbalance",
            message="Review relies on very few evidence sources.", severity="low"))
    if valid_ids and len(valid_ids) == 0:
        pass

    grounded = (
        unsupported == 0
        and len(valid_ids) > 0
        and not any(w.severity == "high" and w.type in ("compensation_language", "sensitive_data") for w in warnings)
    )

    result = ReviewResult(
        markdown=markdown,
        evidence_references=draft.evidence_references,
        fairness=FairnessReport(
            grounded=grounded,
            warnings=warnings,
            unsupported_claims=unsupported,
            cited_evidence=sorted(cited),
        ),
    )
    yield Event(output=result.model_dump())


review_workflow = Workflow(
    name="review_workflow",
    edges=[("START", privacy_node, review_draft_agent, fairness_node)],
)
