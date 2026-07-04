# Diagrams

Polished, self-contained SVGs (dark theme, match the live app) for the README,
the Kaggle writeup, and video slides. They render on GitHub and export cleanly to
PNG. The maintainable, source-of-truth Mermaid versions live in
[../ARCHITECTURE.md](../ARCHITECTURE.md).

## Cover image (Kaggle writeup)
1200×630 title card — the pitch in one frame. A raster `cover.png` (2400×1260,
2×) is exported alongside for platforms that want a bitmap.

![Cover](cover.svg)

## System architecture
The one-slide thesis: **access control, consent and PII minimization run in the
TypeScript app _before_ any model call** — the LLM is never the authorization
boundary.

![System architecture](architecture.svg)

### Detailed view
Same thesis at the depth of the Mermaid source — every tier's inner nodes
(route handlers → auth/RBAC → services → privacy filter → DB; REST → workflow
graphs → security node → Gemini; SkillToolset + OpenTelemetry → Cloud Trace) and
the labelled edges, including the security-boundary crossing.

![System architecture — detailed](architecture-detailed.svg)

## The three ADK 2.0 agent workflows
Questionnaire (plan → verdict-only safety → deterministic expand), Evidence
(PII node → validator → confidence-gated routing), Review (privacy → draft →
fairness/grounding).

![Agent workflows](agent-workflows.svg)

## Deployment topology
Browser → Next.js on Vercel → stateless Python agent on Cloud Run (Vertex mode,
no key in image) → Gemini; Vercel ↔ Turso. Secrets in env only.

![Deployment topology](deploy-topology.svg)
