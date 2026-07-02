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

import hmac
import json
import os
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

from app.agent import matrix_meta_workflow, questionnaire_workflow
from app.evidence import evidence_workflow
from app.review import review_workflow
from app.matrix import (
    MATRIX_MIN_ITEMS,
    build_matrix_questionnaire,
    parse_pasted_items,
    screen_items,
)
from app.schemas import MatrixMeta, QuestionnaireOutput, QuestionnaireWithSafety, SafetyReport


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


async def _matrix_fast_path(body: dict, items: list[str]) -> dict:
    """Large pasted list: parse items in code; the model only returns tiny
    metadata (scale/title/refusal). Output is constant-size, so this stays fast
    regardless of item count."""
    meta = MatrixMeta(**await run_or_422(matrix_meta_workflow, body))
    if meta.refused:
        questionnaire = QuestionnaireOutput(
            title=meta.title or "Questionnaire",
            purpose=meta.purpose,
            privacy_mode=meta.privacy_mode,
            refused=True,
            refusal_reason=meta.refusal_reason,
            questions=[],
        )
        safety = SafetyReport(decision="needs_revision", notes=meta.refusal_reason)
    else:
        questionnaire = build_matrix_questionnaire(
            items, meta, bool(body.get("require_evidence", True))
        )
        safety = screen_items(items)
    return QuestionnaireWithSafety(questionnaire=questionnaire, safety=safety).model_dump()


@app.post("/questionnaire", dependencies=[Depends(require_agent_key)])
async def questionnaire(body: dict):
    """Generate + safety-review a questionnaire. Body: QuestionnaireInput-ish.
    A large pasted item list takes the deterministic matrix fast path; otherwise
    the normal LLM workflow runs."""
    items = parse_pasted_items(body.get("notes") or "")
    if len(items) >= MATRIX_MIN_ITEMS:
        return await _matrix_fast_path(body, items)
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
