# ruff: noqa
"""Standalone checks for the matrix fast-path parser + builder (no GCP, no LLM).
Run:  uv run python tests/test_matrix.py   (also importable by pytest)."""

from app.matrix import (
    MATRIX_MIN_ITEMS,
    build_matrix_questionnaire,
    parse_pasted_items,
    screen_items,
)
from app.schemas import MatrixMeta, ScaleLevel


def test_prose_is_not_a_list():
    prose = "Collect evidence of collaboration and mentoring with concrete examples and measurable impact."
    assert len(parse_pasted_items(prose)) < MATRIX_MIN_ITEMS


def test_big_comma_list_after_marker_drops_scale_sentence():
    skills = ", ".join(f"Skill{i}" for i in range(120))
    notes = f"Rate each on L1 Awareness, L2 Working, L3 Proficient, L4 Advanced, L5 Expert. Skills: {skills}"
    items = parse_pasted_items(notes)
    assert len(items) == 120
    assert "Skill0" in items and "L1 Awareness" not in items


def test_newline_list_and_bullets():
    notes = "Skills:\n- TypeScript\n- React\n* Node\n1. SQL\nDocker"
    items = parse_pasted_items(notes)
    assert items == ["TypeScript", "React", "Node", "SQL", "Docker"]


def test_dedupe():
    assert parse_pasted_items("Skills: React, react, REACT, Node") == ["React", "Node"]


def test_screen_flags_protected_topic():
    assert screen_items(["React", "Node"]).decision == "approved"
    flagged = screen_items(["React", "marital status", "religion"])
    assert flagged.decision == "needs_revision"
    assert len(flagged.risky_questions) == 2


def test_build_uses_scale():
    meta = MatrixMeta(
        title="M", scale_legend=[ScaleLevel(label="L1"), ScaleLevel(label="L2")]
    )
    q = build_matrix_questionnaire(["A", "B", "C"], meta, require_evidence=False)
    assert len(q.questions) == 3
    assert all(x.question_type == "single_choice" for x in q.questions)
    assert q.questions[0].options == ["L1", "L2"]


def test_build_no_scale_is_free_text():
    q = build_matrix_questionnaire(["A", "B"], MatrixMeta(title="M"), require_evidence=True)
    assert all(x.question_type == "long_text" for x in q.questions)
    assert q.questions[0].evidence_required is True


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} matrix checks passed")
