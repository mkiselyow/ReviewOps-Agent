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

import json
import os
import uuid

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from google.adk.apps import App
from google.adk.runners import InMemoryRunner
from google.genai import types

from app.agent import questionnaire_workflow
from app.evidence import evidence_workflow


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


app = FastAPI(title="reviewops-agent-local")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/questionnaire")
async def questionnaire(body: dict):
    """Generate + safety-review a questionnaire. Body: QuestionnaireInput-ish."""
    return await run_workflow(questionnaire_workflow, body)


@app.post("/evidence")
async def evidence(body: dict):
    """Validate evidence + confidence-gated routing. Body: EvidenceInput."""
    return await run_workflow(evidence_workflow, body)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8800)
