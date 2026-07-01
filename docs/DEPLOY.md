# Deploying ReviewOps Agent

**Live demo: https://reviewops-agent.vercel.app** (frontend, Vercel) →
`https://reviewops-agent-646537488167.us-central1.run.app` (agent, Cloud Run) →
Turso (libSQL).

Production topology (Option B — a live public demo):

```
Browser ─▶ Next.js frontend (Vercel)  ── AGENT_SERVICE_URL ──▶  Python agent service (Cloud Run)
                    │                                              questionnaire / evidence / review
                    └── Turso (libSQL)  ◀── app data (users, questionnaires, evidence, reviews…)
```

- The **backend is stateless** → Cloud Run (serves our REST: `/questionnaire`, `/evidence`, `/review`).
- The **frontend uses SQLite** locally; on serverless it uses **Turso (hosted libSQL)** via the
  dual-driver in `src/server/db/index.ts` (better-sqlite3 locally/tests, libSQL when
  `TURSO_DATABASE_URL` is set).

> **Note:** deployment is **optional for capstone judging** — a public GitHub repo with these
> instructions also satisfies the "project link". The backend alone (Cloud Run) demonstrates the
> "Deployability" concept.

---

## 1. Backend → Cloud Run (done)

The Python service (`agent-service/`) runs `app/local_server.py` via the Dockerfile. It uses
**Vertex mode** (`GOOGLE_GENAI_USE_VERTEXAI=True`) so the Cloud Run runtime service account
authenticates to Gemini via ADC — **no API key in the image**.

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com aiplatform.googleapis.com

gcloud run deploy reviewops-agent \
  --source agent-service --region us-central1 --allow-unauthenticated \
  --set-env-vars "GEMINI_MODEL=gemini-2.5-flash,DISABLE_LOCAL_OTEL=1,GOOGLE_GENAI_USE_VERTEXAI=True,GOOGLE_CLOUD_PROJECT=<PROJECT>,GOOGLE_CLOUD_LOCATION=us-central1,AGENT_SHARED_SECRET=<SHARED_SECRET>" \
  --min-instances 0 --max-instances 4 --memory 1Gi

# AGENT_SHARED_SECRET must MATCH the value set on Vercel. When set, the agent
# rejects any /questionnaire /evidence /review call missing a matching
# X-Agent-Key header (401) — so only our backend can spend Gemini quota. For a
# real secret, prefer Secret Manager: --set-secrets AGENT_SHARED_SECRET=<name>:latest

# smoke test
curl "$SERVICE_URL/health"
curl -X POST "$SERVICE_URL/questionnaire" -H 'content-type: application/json' \
  -d '{"topic":"Q2 collaboration","period":"2026-Q2","require_evidence":false}'
```

Live service: `https://reviewops-agent-646537488167.us-central1.run.app`.
No CORS needed — the **Next.js server** (not the browser) calls this endpoint.

## 2. Database → Turso (libSQL) — user setup

```bash
# one-time
curl -sSfL https://get.tur.so/install.sh | bash   # or: brew install tursodatabase/tap/turso
turso auth signup
turso db create reviewops
turso db show reviewops --url          # -> TURSO_DATABASE_URL  (libsql://...)
turso db tokens create reviewops       # -> TURSO_AUTH_TOKEN
```

Apply the schema + seed the demo data (run locally with the Turso env pointed at the new DB):

```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx drizzle-kit push
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run seed
```

(Tests + local dev ignore Turso — they use better-sqlite3 — so nothing changes there.)

## 3. Frontend → Vercel — user setup

Import the GitHub repo in Vercel (or `vercel` CLI), then set **Environment Variables**:

| Variable | Value |
| --- | --- |
| `AGENT_SERVICE_URL` | the Cloud Run URL from step 1 |
| `TURSO_DATABASE_URL` | from step 2 |
| `TURSO_AUTH_TOKEN` | from step 2 |
| `TOKEN_EXPIRY_HOURS` | `168` |
| `SESSION_SECRET` | random 32+ bytes — signs the session cookie (anti-forgery) |
| `AGENT_SHARED_SECRET` | random secret — **must match** the value set on Cloud Run (step 1) |
| `MANAGER_PASSPHRASE` | (optional) enables real-manager passphrase sign-in |
| `MANAGER_USER_ID` | (optional) the real manager's seed id (e.g. `u_real_manager`) |
| `AGENT_RATE_LIMIT_PER_HOUR` | (optional) per-manager agent-call budget, default `30` |

Deploy. Open the Vercel URL → log in as **Maria** → create a questionnaire (calls the Cloud Run
agent) → submit a response → generate a review. Full path, live.

> Alternative to Vercel: deploy the frontend as a container to Cloud Run too (same env vars);
> avoids serverless native-module quirks.

## Security notes
- No secrets in code or images. Backend uses the runtime SA (Vertex ADC); the Gemini API key is
  only in `agent-service/.env` for local dev (gitignored).
- The Cloud Run backend is currently public (`--allow-unauthenticated`) for demo simplicity; for
  production, require auth and have the frontend attach an ID token.
