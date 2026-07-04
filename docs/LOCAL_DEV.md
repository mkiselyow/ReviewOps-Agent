# Local Dev Runbook — run FE + BE + agents together

ReviewOps is a **hybrid**: two processes must run side by side.

```
 ┌─────────────────────────┐        REST         ┌──────────────────────────────┐
 │ Frontend (Next.js, TS)  │ ───────────────────▶│ Agent service (Python ADK 2.0)│
 │ http://localhost:3000   │  AGENT_SERVICE_URL  │ http://127.0.0.1:8800         │
 └─────────────────────────┘                     └──────────────────────────────┘
```

The agent brain lives in the Python service, so **the agent service must be
running** for any agent flow (generate questionnaire, validate evidence, draft
review). There is no in-process fallback.

---

## 0. Prerequisites (one-time)
- **Node.js 24+** (frontend) and **[uv](https://docs.astral.sh/uv/)** + Python
  3.11–3.13 (agent service). Install uv: `winget install astral-sh.uv`.
- **`agents-cli`**: `uv tool install google-agents-cli`.
- A **Gemini API key with credits** (Google AI Studio → https://ai.studio/apikey).
  Free tier hits 503/429; a small prepaid top-up is plenty.

---

## 1. Start the agent service (terminal A)

```bash
cd agent-service

# one-time: create the venv + install deps
agents-cli install

# one-time: set the key (gitignored)
#   agent-service/.env:
#     GOOGLE_API_KEY=<your key>
#     GEMINI_MODEL=gemini-2.5-flash

# run the local REST server on :8800
uv run uvicorn app.local_server:app --host 127.0.0.1 --port 8800
# (Windows fallback: .venv\Scripts\python -m uvicorn app.local_server:app --port 8800)
```

**Smoke-test it** (terminal C). Pick the block for your shell.

> **Shell note:** in PowerShell, `curl` is an alias for `Invoke-WebRequest`, which
> rejects `-s/-X/-H/-d` ("positional parameter not found", "-H not recognized") —
> use `Invoke-RestMethod`, or call the real binary as `curl.exe`. Line
> continuation is backtick `` ` `` in PowerShell, `\` in bash.

**PowerShell** (`Invoke-RestMethod`):
```powershell
Invoke-RestMethod http://127.0.0.1:8800/health
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8800/questionnaire `
  -ContentType application/json `
  -Body '{"topic":"Q2 collaboration and ownership","period":"2026-Q2"}'
```

**bash / cmd** (real curl — `curl.exe` also works from PowerShell):
```bash
curl.exe http://127.0.0.1:8800/health
curl.exe -s -X POST http://127.0.0.1:8800/questionnaire \
  -H "Content-Type: application/json" \
  -d '{"topic":"Q2 collaboration and ownership","period":"2026-Q2"}'
```

You should get back a questionnaire + safety verdict. The service log prints
OpenTelemetry trajectory spans (`[otel] invoke_workflow …`).

Endpoints: `POST /questionnaire`, `POST /evidence`, `POST /review`, `GET /health`.

---

## 2. Start the frontend (terminal B)

```bash
# from the repo root
npm install                      # one-time
cp .env.example .env             # one-time
#   .env must have: AGENT_SERVICE_URL=http://127.0.0.1:8800
npm run db:push                  # one-time: create the SQLite schema
npm run seed                     # one-time: load synthetic demo data
npm run dev                      # http://localhost:3000
```

---

## 3. Click through the full flow
1. Open http://localhost:3000 and **log in as Maria** (Engineering Manager) →
   dashboard shows only Anna/Mark/Julia (Olek hidden).
2. **Create questionnaire** → preview shows the safety review → **Approve** →
   personal links land in the **mock outbox**.
3. Open Anna's link, submit a weak answer → validator asks a follow-up; improve
   it and resubmit.
4. Log in as **Anna** (a non-manager → `/employee`) → **Add evidence** directly →
   high-confidence auto-saves; low-confidence goes to the manager.
5. Back as Maria → **Evidence review queue** (approve/reject) and **Results** →
   **Generate review draft** → fairness check → approve → export Markdown.

---

## 4. Tests & checks (no agent service needed)
```bash
npm run typecheck      # tsc --noEmit
npm test               # Vitest (in-memory SQLite; mocks the agent client)
npm run build          # Next production build
```
Agent behavior is evaluated separately (`agents-cli eval`, see
`EVALUATION_PLAN.md` — needs GCP).

---

## 5. Troubleshooting
| Symptom | Cause / fix |
| --- | --- |
| App agent calls 500/`fetch failed` | Agent service not running, or `AGENT_SERVICE_URL` unset/wrong. |
| Service returns 503 / 429 | Gemini overloaded or out of credits — wait, or top up; ensure `GEMINI_MODEL` is one your key allows (`gemini-2.5-flash`). |
| `429 limit: 0` for a model | That model isn't on your tier — switch `GEMINI_MODEL`. |
| Port 8800 in use | Stop the old uvicorn, or pass `--port` and update `AGENT_SERVICE_URL`. |
| Too-noisy OTel logs | `DISABLE_LOCAL_OTEL=1` before starting the service. |
| `db:push` warns about data loss / `seed` fails with `no such column` | Your local `data/reviewops.sqlite` predates a schema change. It's disposable demo data: delete the file, then re-run `npm run db:push && npm run seed`. |
