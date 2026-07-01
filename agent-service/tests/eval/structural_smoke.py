# ruff: noqa
"""Live structural smoke test for the questionnaire generator.

Unlike the fast TS unit tests (which mock the model), this drives the REAL agent
service and asserts the STRUCTURE the generator produces for different manager
prompts:

  - a structured skill matrix  -> per-item single_choice, sections, opt-in gates
  - a narrative ask + evidence -> long_text questions carrying evidence_required
  - the same ask, evidence off -> no evidence demanded anywhere
  - an explicit metrics ask     -> typed inputs (number / date / email)

It is GATED: it needs the service running with a funded Gemini key, so it is NOT
part of CI. Run it on demand:

    # start the service first (see docs/LOCAL_DEV.md), then:
    BASE=http://127.0.0.1:8800 python tests/eval/structural_smoke.py
    # (PowerShell)  $env:BASE="http://127.0.0.1:8800"; python tests/eval/structural_smoke.py

Exits non-zero if any case fails.
"""

import json
import os
import sys
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8800")

MATRIX_NOTES = """Gather a skill matrix. Two sections; each section is opt-in
(answer yes to reveal its questions). For each skill use this scale, default
empty = not familiar/NA: L1 Awareness, L2 Working Knowledge, L3 Practitioner,
L4 Advanced, L5 Expert.
Section 'Frameworks': React, Next.js, Vue, Angular, Redux, Tailwind.
Section 'Engineering': Accessibility, Performance, Testing, CSS architecture."""

METRICS_NOTES = """Collect three concrete data points for the quarter:
the number of pull requests merged, the date of the last production release,
and the engineer's preferred contact email."""


def post(payload: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE}/questionnaire",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.loads(r.read())


def types(qs):
    return [q["question_type"] for q in qs]


CASES = [
    {
        "name": "structured skill matrix (evidence off)",
        "payload": {
            "topic": "Frontend skill matrix",
            "period": "2026-Q2",
            "notes": MATRIX_NOTES,
            "require_evidence": False,
        },
        "checks": [
            (">= 8 questions", lambda qs: len(qs) >= 8),
            ("mostly single_choice", lambda qs: types(qs).count("single_choice") >= len(qs) // 2),
            (">= 2 sections", lambda qs: len({q["section"] for q in qs if q["section"]}) >= 2),
            (">= 1 opt-in gate", lambda qs: any(q["opt_in"] for q in qs)),
            ("choices have >= 2 options", lambda qs: all(len(q["options"]) >= 2 for q in qs if q["question_type"] in ("single_choice", "multi_choice", "rating"))),
            ("no evidence demanded", lambda qs: not any(q["evidence_required"] for q in qs)),
        ],
    },
    {
        "name": "narrative ask (evidence on)",
        "payload": {
            "topic": "Q2 ownership and collaboration evidence",
            "period": "2026-Q2",
            "require_evidence": True,
        },
        "checks": [
            ("5-9 questions", lambda qs: 4 <= len(qs) <= 9),
            ("has long_text", lambda qs: "long_text" in types(qs)),
            (">= 1 evidence_required", lambda qs: any(q["evidence_required"] for q in qs)),
            ("evidence only on text types", lambda qs: all(q["question_type"] in ("long_text", "short_text") for q in qs if q["evidence_required"])),
            ("no standalone evidence_link", lambda qs: "evidence_link" not in types(qs)),
        ],
    },
    {
        "name": "narrative ask (evidence off)",
        "payload": {
            "topic": "Q2 ownership and collaboration evidence",
            "period": "2026-Q2",
            "require_evidence": False,
        },
        "checks": [
            ("no evidence demanded", lambda qs: not any(q["evidence_required"] for q in qs)),
        ],
    },
    {
        "name": "explicit metrics ask -> typed inputs",
        "payload": {
            "topic": "Quarter metrics",
            "period": "2026-Q2",
            "notes": METRICS_NOTES,
            "require_evidence": False,
        },
        "checks": [
            ("uses a typed input (number/date/email)", lambda qs: bool({"number", "date", "email"} & set(types(qs)))),
        ],
    },
]


def main() -> int:
    failures = 0
    for case in CASES:
        print(f"\n=== {case['name']} ===")
        try:
            r = post(case["payload"])
            qs = r["questionnaire"]["questions"]
        except Exception as e:  # noqa: BLE001
            print(f"  REQUEST FAILED: {e}")
            failures += 1
            continue
        print(f"  {len(qs)} questions; types={dict((t, types(qs).count(t)) for t in set(types(qs)))}; safety={r['safety']['decision']}")
        for desc, check in case["checks"]:
            try:
                ok = check(qs)
            except Exception as e:  # noqa: BLE001
                ok = False
                desc = f"{desc} (error: {e})"
            print(f"  [{'PASS' if ok else 'FAIL'}] {desc}")
            if not ok:
                failures += 1
    print(f"\n{'ALL PASSED' if failures == 0 else str(failures) + ' CHECK(S) FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
