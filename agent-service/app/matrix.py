# ruff: noqa
"""Matrix FAST PATH — parse a manager-pasted item list in code.

When the manager pastes a LARGE delimited list (e.g. 400 skills to rate on a
shared scale), having the model emit one line per item is O(N) output and blows
the serverless function's time budget. Instead we parse the items here (pure,
instant) and only ask a tiny LLM for the scale/title/refusal (constant-size
output). Generation then no longer scales with item count.

Pure module (no ADK): the runner wiring lives in app/local_server.py.
"""

import re

from .schemas import (
    GeneratedQuestion,
    MatrixMeta,
    QuestionnaireOutput,
    RiskyQuestion,
    SafetyReport,
)

# Only take the fast path when the paste clearly looks like a big list; below
# this, the normal LLM workflow gives better structure/explanations.
MATRIX_MIN_ITEMS = 40

# "Skills:", "Competencies -", "Items:" … marks where the list starts (the scale
# sentence usually precedes it, so splitting here drops the scale text).
_ITEM_MARKER = re.compile(
    r"(?:skills?|items?|competenc(?:y|ies)|topics?|areas?|technologies)\s*[:\-]\s*",
    re.I,
)
_SCALE_WORDS = re.compile(r"\b(scale|rate|rating|level|proficienc)\b", re.I)
_SCALE_LEVEL = re.compile(r"^(?:L|level\s*)[0-9]\b", re.I)
_BULLET = re.compile(r"^[\s\-\*•–—\d\.\)\(]+")
# Word-start + stem + `\w*` so prefixes match full words (religio→religion,
# politic→political) without over-matching (famil(y|ies|ial) not "familiar";
# disabilit not "disable").
_PROTECTED = re.compile(
    r"\b(?:health|medical|illness|disease|disabilit|pregnan|famil(?:y|ies|ial)|"
    r"marriage|marital|spouse|children|religio|politic|nationalit|ethnic|"
    r"immigrat|visa|salary|compensation|sexual)\w*",
    re.I,
)


def parse_pasted_items(notes: str) -> list[str]:
    """Extract a list of short item names from pasted notes. Conservative: returns
    few/none for prose, so the fast path only triggers on a genuine list."""
    if not notes:
        return []
    text = notes
    marker = _ITEM_MARKER.search(notes)
    if marker:
        text = notes[marker.end():]

    items: list[str] = []
    for chunk in re.split(r"[\n,;]+", text):
        s = _BULLET.sub("", chunk).strip().strip(".").strip()
        if not s or len(s) > 60:  # long → a sentence, not an item name
            continue
        if _SCALE_LEVEL.match(s):  # "L1 Awareness" etc. — a scale level, not an item
            continue
        if _SCALE_WORDS.search(s) and len(s.split()) > 4:  # an instruction sentence
            continue
        items.append(s)

    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        k = it.lower()
        if k not in seen:
            seen.add(k)
            out.append(it)
    return out[:600]


def screen_items(items: list[str]) -> SafetyReport:
    """Deterministic protected-topic screen over the item names (fast, no LLM)."""
    risky = [
        RiskyQuestion(
            position=i,
            reason="Item mentions a protected/sensitive topic.",
            safer_alternative="Rephrase as a work-related skill or competency.",
        )
        for i, t in enumerate(items)
        if _PROTECTED.search(t)
    ]
    return SafetyReport(
        decision="needs_revision" if risky else "approved",
        risky_questions=risky,
        notes="Deterministic screen of the pasted items flagged sensitive topics."
        if risky
        else "",
    )


def build_matrix_questionnaire(
    items: list[str], meta: MatrixMeta, require_evidence: bool
) -> QuestionnaireOutput:
    """One question per parsed item: single_choice over the shared scale when the
    request described one, else a free-text question."""
    labels = [lvl.label for lvl in meta.scale_legend]
    questions: list[GeneratedQuestion] = []
    for i, text in enumerate(items):
        if labels:
            qtype, options, ev = "single_choice", labels, False
        else:
            qtype, options, ev = "long_text", [], bool(require_evidence)
        questions.append(
            GeneratedQuestion(
                position=i,
                question_type=qtype,
                text=text,
                options=options,
                explanation="",
                required=True,
                evidence_required=ev,
                section="",
                opt_in=False,
            )
        )
    return QuestionnaireOutput(
        title=meta.title or "Skill matrix",
        purpose=meta.purpose,
        privacy_mode=meta.privacy_mode,
        refused=False,
        refusal_reason="",
        scale_legend=meta.scale_legend,
        questions=questions,
    )
