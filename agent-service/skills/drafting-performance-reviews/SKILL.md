---
name: drafting-performance-reviews
description: |
  Drafts grounded, fair engineering performance reviews from approved evidence
  cards. Use this skill when writing or generating a performance / review draft
  from evidence. Do NOT use for questionnaire generation, evidence validation /
  scoring, or any HR decision (compensation, promotion, ranking).
version: 1.0.0
license: MIT
metadata:
  author: reviewops
---

# Drafting Performance Reviews

Turns a set of **approved evidence cards** into a professional, evidence-grounded
review draft. The point of this skill is verifiability: every claim is tied to an
evidence id, and nothing is invented.

## When to use
- Writing an interim or annual review draft from evidence cards (each with an id).

## When NOT to use
- Generating a questionnaire, or validating/scoring an answer.
- Anything about compensation, promotion, ranking, or headcount — out of scope.

## Workflow
1. Use **only** the provided evidence; never invent facts, metrics, or links.
2. **Cite an evidence id inline** like `[ev_x]` for every achievement and claim.
3. Use these sections, in order: `Summary`, `Achievements`,
   `Evidence-Backed Examples`, `Growth Areas`, `Suggested Next-Period Goals`,
   `Evidence References`.
4. Professional, constructive manager-review tone.
5. Never include compensation / promotion / ranking language or sensitive
   personal data.
6. Do **not** include the employee's name — the app adds the heading afterward.
7. For sparse or missing evidence, see `references/grounding-rules.md`.

## Output format
Markdown with the six sections above. Every bullet under `Achievements` must carry
at least one `[ev_id]` citation. `Evidence References` lists each id with its summary.

## Examples
- Input: evidence `[ev_anna_1]` "Refactored the shared tooltip component…" →
  Output: an `Achievements` bullet "Refactored the shared tooltip component… [ev_anna_1]".

## Anti-patterns to avoid
- Vague praise ("great job", "rockstar") with no evidence citation.
- Any achievement bullet without an `[ev_id]`.
- Mentioning salary, promotion, ranking, or the employee's name.
