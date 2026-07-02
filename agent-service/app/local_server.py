# ruff: noqa
"""Lightweight LOCAL REST server for the ReviewOps agent workflows.

Runs each ADK 2.0 Workflow via an in-memory Runner and returns the structured
terminal output as JSON. No GCP / Cloud Trace / Cloud Logging dependencies, so
it runs with just a Gemini API key.

For local dev only. Production serving is `app/fast_api_app.py` (Agent Runtime,
with telemetry + GCP auth). The Next.js app calls these endpoints via
`AGENT_SERVICE_URL`.

Run:  uvicorn app.local_server:app --host 127.0.0.1 --port 8800
"""

import asyncio
import hmac
import json
import os
import re
import uuid

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from dotenv import load_dotenv

load_dotenv()

# --- Local observability (OpenTelemetry) ------------------------------------
# ADK 2.0 emits agent.session / agent.* spans via OpenTelemetry. Locally we
# export them concisely to the console so the "trajectory" is visible without
# GCP. In production, app/fast_api_app.py wires Cloud Trace instead.
from opentelemetry import trace as _otel_trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter
from opentelemetry.sdk.trace.export import SpanExportResult


class _ConciseConsoleExporter(SpanExporter):
    def export(self, spans):
        for s in spans:
            dur_ms = (
                (s.end_time - s.start_time) / 1e6
                if s.end_time and s.start_time
                else 0.0
            )
            print(f"[otel] {s.name} {dur_ms:.0f}ms", flush=True)
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:  # noqa: D401
        return None


if not os.environ.get("DISABLE_LOCAL_OTEL"):
    _provider = TracerProvider()
    _provider.add_span_processor(SimpleSpanProcessor(_ConciseConsoleExporter()))
    _otel_trace.set_tracer_provider(_provider)

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import ValidationError
from google.adk.apps import App
from google.adk.runners import InMemoryRunner
from google.genai import types

from app.agent import (
    expand_plan,
    plan_workflow,
    questionnaire_workflow,
    safety_workflow,
)
from app.evidence import evidence_workflow
from app.review import review_workflow
from app.schemas import (
    QuestionnaireOutput,
    QuestionnairePlan,
    QuestionnaireWithSafety,
    SafetyReport,
)


async def run_workflow(workflow, payload: dict) -> dict:
    """Run an ADK Workflow once and return its structured terminal output.

    Terminal output may arrive either as a function-node `Event.output` or as a
    final agent's `Event.content` text (JSON) — handle both.
    """
    adk_app = App(root_agent=workflow, name=workflow.name)
    runner = InMemoryRunner(app=adk_app)
    user_id = "system"
    session_id = str(uuid.uuid4())
    await runner.session_service.create_session(
        app_name=runner.app_name, user_id=user_id, session_id=session_id
    )

    message = types.Content(role="user", parts=[types.Part(text=json.dumps(payload))])
    final_output = None
    final_text = None
    async for event in runner.run_async(
        user_id=user_id, session_id=session_id, new_message=message
    ):
        out = getattr(event, "output", None)
        if out is not None:
            final_output = out
        if event.content and event.content.parts:
            text = "".join((p.text or "") for p in event.content.parts)
            if text.strip():
                final_text = text

    if final_output is not None:
        return final_output if isinstance(final_output, dict) else json.loads(final_output)
    if final_text:
        return json.loads(final_text)
    return {"error": "no output produced"}


_TOO_LARGE_MSG = (
    "The request produced output too large to complete in one pass — reduce the "
    "number of items or split it into smaller sections, then try again."
)


async def run_or_422(workflow, body: dict) -> dict:
    """Run a workflow, mapping truncated/oversized-output failures (a model that
    exceeded its token budget → invalid/incomplete JSON → schema validation error)
    to a clean 422 with guidance, instead of an opaque 500."""
    try:
        return await run_workflow(workflow, body)
    except (ValidationError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail=_TOO_LARGE_MSG)
    except Exception as exc:  # noqa: BLE001 — inspect ADK-wrapped node failures
        blob = f"{type(exc).__name__}: {exc}".lower()
        if any(k in blob for k in ("json", "validation", "eof", "node execution failed")):
            raise HTTPException(status_code=422, detail=_TOO_LARGE_MSG)
        raise


app = FastAPI(title="reviewops-agent-local")


def require_agent_key(x_agent_key: str | None = Header(default=None)) -> None:
    """Shared-secret gate. When AGENT_SHARED_SECRET is set (deployed), every
    workflow call must present a matching `X-Agent-Key` header — so only our
    backend can reach this service and strangers can't drain the Gemini quota.
    When unset (local dev), the check is skipped."""
    expected = os.environ.get("AGENT_SHARED_SECRET")
    if not expected:
        return
    if not x_agent_key or not hmac.compare_digest(x_agent_key, expected):
        raise HTTPException(status_code=401, detail="invalid or missing X-Agent-Key")


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Chunked generation (large questionnaires) ------------------------------
# A big matrix in one LLM call is O(N) output → slow / 60s function timeout. We
# split the pasted notes into chunks of WHOLE sections (sharing the preamble +
# scale), generate each chunk's plan in PARALLEL, merge, run safety once, expand.
CHUNK_TRIGGER_CHARS = 2500  # notes longer than this may be chunked
CHUNK_MAX_CHARS = 1800  # per-chunk budget for the section text (excl. preamble)
CHUNK_CONCURRENCY = 5  # parallel LLM calls (rate-limit guard)
MAX_CHUNKS = 12


def _is_section_block(block: str) -> bool:
    """A blank-line-delimited block that looks like 'Section header\\nitem\\nitem…'
    (short header line, not a sentence, not a scale block, ≥1 following line)."""
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    if len(lines) < 2:
        return False
    head = lines[0]
    if len(head) > 60 or head.endswith("."):
        return False
    if re.match(r"(?i)^(l\d|level\s*\d)\b", head):  # a scale block, not a section
        return False
    return True


def build_chunks(notes: str) -> list[str]:
    """Split notes into chunks, each = preamble + a group of whole section blocks
    under the size budget. Returns [] when the notes don't look sectioned (caller
    then uses the single-pass workflow)."""
    blocks = [b for b in re.split(r"\n\s*\n", notes.strip()) if b.strip()]
    first = next((i for i, b in enumerate(blocks) if _is_section_block(b)), None)
    if first is None:
        return []
    preamble = "\n\n".join(blocks[:first]).strip()
    sections = blocks[first:]

    groups: list[list[str]] = []
    cur: list[str] = []
    cur_len = 0
    for b in sections:
        if cur and cur_len + len(b) > CHUNK_MAX_CHARS:
            groups.append(cur)
            cur, cur_len = [], 0
        cur.append(b)
        cur_len += len(b)
    if cur:
        groups.append(cur)

    if len(groups) < 2:
        return []
    chunks = ["\n\n".join(([preamble] if preamble else []) + g) for g in groups]
    return chunks[:MAX_CHUNKS]


def _merge_plans(plans: list[QuestionnairePlan]) -> QuestionnairePlan:
    items = []
    scale = []
    title = ""
    purpose = ""
    for p in plans:
        items.extend(p.items)
        if not scale and p.scale_legend:
            scale = p.scale_legend
        if not title and p.title:
            title = p.title
        if not purpose and p.purpose:
            purpose = p.purpose
    return QuestionnairePlan(
        title=title or "Skills questionnaire",
        purpose=purpose,
        scale_legend=scale,
        items=items,
    )


async def generate_chunked(body: dict, chunks: list[str]) -> dict:
    sem = asyncio.Semaphore(CHUNK_CONCURRENCY)

    async def one(chunk_text: str) -> QuestionnairePlan:
        async with sem:
            data = await run_or_422(plan_workflow, {**body, "notes": chunk_text})
            return QuestionnairePlan(**data)

    plans = await asyncio.gather(*[one(c) for c in chunks])
    merged = _merge_plans(plans)

    safety_data = await run_or_422(safety_workflow, merged.model_dump())
    safety = SafetyReport(**safety_data)
    questionnaire = expand_plan(merged)
    return QuestionnaireWithSafety(questionnaire=questionnaire, safety=safety).model_dump()


@app.post("/questionnaire", dependencies=[Depends(require_agent_key)])
async def questionnaire(body: dict):
    """Generate + safety-review a questionnaire. A large sectioned paste is split
    into parallel chunks (whole sections) and merged; otherwise a single pass."""
    notes = body.get("notes") or ""
    chunks = build_chunks(notes) if len(notes) > CHUNK_TRIGGER_CHARS else []
    if len(chunks) >= 2:
        return await generate_chunked(body, chunks)
    return await run_or_422(questionnaire_workflow, body)


@app.post("/evidence", dependencies=[Depends(require_agent_key)])
async def evidence(body: dict):
    """Validate evidence + confidence-gated routing. Body: EvidenceInput."""
    return await run_or_422(evidence_workflow, body)


@app.post("/review", dependencies=[Depends(require_agent_key)])
async def review(body: dict):
    """Generate a grounded review draft + fairness report. Body: ReviewContextInput."""
    return await run_or_422(review_workflow, body)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8800)
