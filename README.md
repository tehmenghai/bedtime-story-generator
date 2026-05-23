# Bedtime Story Generator

A child-safety-aware bedtime story generator. A parent enters their child's name, characters, a setting, and a one-line plot; the app calls Google's Gemini through a hosted API, returns a short bedtime story formatted for reading aloud, and persists it so the child can re-hear yesterday's story without re-generating it. Built as the capstone of the SCTP **Bedtime Story Generator** conversion course.

## Live demo

- **Frontend:** <https://your-vercel-url.vercel.app> (TBD - Update after deploying)
- **Backend health:** <https://your-render-url.onrender.com/healthz> (TBD - Update after deploying) *(returns `{"postgres":true}`)*

> **Note on cold starts.** The backend runs on Render's free tier and spins down after 15 minutes of no traffic. The first request after a sleep takes ~30 seconds while it warms up; subsequent requests are sub-second. That's free-tier behaviour, not a bug.

## What it does

- Four-field form (child name, characters, setting, plot) → calm, child-safe bedtime story (≤5 paragraphs, addresses the child by name, no violence, gentle resolution).
- Stories are persisted to Postgres against the child's name. Click any saved story in the *"Past stories"* panel to re-hear it without paying for a new Gemini call.
- Production deploy: Vercel CDN for the static frontend, Render for the long-running FastAPI backend with managed Postgres. CORS configured to allow cross-origin requests.
- Loud-fail config — missing `GEMINI_API_KEY` or `DATABASE_URL` refuses to start, never silently runs broken.

## Stack

- **Python 3.11 + FastAPI** — backend HTTP API (3 endpoints: `POST /story`, `GET /stories`, `GET /healthz`).
- **Google Gemini API (`gemini-2.5-flash-lite`)** — hosted LLM for story generation, called via the `google-genai` SDK.
- **Postgres + psycopg 3** — managed Postgres on Render; one table (`stories`) with a composite index on `(child_name, created_at DESC)`.
- **Plain HTML + CSS + vanilla JS** — no framework, no build step. Three static files served from Vercel.
- **Render + Vercel** — backend on Render (Blueprint deploy from `render.yaml`), frontend on Vercel (static deploy from `vercel.json`).

## Run it locally

Requires Python 3.11+, Postgres, and a free Google AI Studio API key (<https://aistudio.google.com/apikey>).

```bash
# 1. Setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env: paste your real GEMINI_API_KEY; DATABASE_URL stays as the local default

# 3. Database
createdb llm_question_log
psql "$DATABASE_URL" -f sql/002_create_stories.sql

# 4. Run two terminals (the deploy split mirrors local dev):
# Terminal 1 — backend on :8000
uvicorn app.main:app --reload

# Terminal 2 — frontend on :5173
python -m http.server 5173 --directory frontend
```

Open <http://localhost:5173>. The frontend's `BACKEND_URL` is hardcoded to my Render production URL — for local testing against your own backend, edit that line in `frontend/script.js`.

## What I learned

- **The schema names the domain, not the UI.** Deleting V1's `interactions` table and three Pydantic classes when the app went from Q&A to bedtime stories — even though they were structurally similar — was crucial because the names lied about what was happening.
- **Production system prompts include safety constraints, not just style.** The shift from V1's `'You are a concise, helpful assistant'` to a five-rule system prompt with a refuse-with-grace closing line was the moment the app started feeling like something for a real child, not a demo.
- **Storing the generated body alongside the inputs, not just the inputs, is the whole reason the click-to-rehear feature works.** Re-generating from the same form fields gives a different story (LLMs are non-deterministic) and costs a Gemini call; storing the body is essentially-free disk for a feature the child actually wants.
- **The Vercel + Render split surfaced cross-origin handling without re-introducing serverless.** Same uvicorn-as-receptionist mental model from V1, just on a different host.

---

🤖 Built with [Antigravity (Gemini)](https://antigravity.google) as an AI partner during the SCTP Bedtime Story Generator course.
