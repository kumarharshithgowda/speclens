# SpecLens — Requirements Intelligence

SpecLens turns specification PDFs into structured, analysed requirements, shows exactly what changed between document versions, generates QA test cases, and proves coverage with a traceability matrix.

Built with **React + TypeScript + Vite + Tailwind + Radix + Recharts** (frontend) and **FastAPI + SQLAlchemy + PyMuPDF** (backend). SQLite by default, PostgreSQL-compatible.

## Quick start

Requirements: Python 3.11+, Node 18+.

```bash
# 1) Backend
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # optional: add AI_API_KEY
uvicorn app.main:app --reload --port 8000

# 2) Frontend (new terminal)
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

On first start the database is created automatically and a **demo workspace is seeded** (3 projects, 4 document versions, 53 requirements, 96 tests, one version change set) by running real sample PDFs through the pipeline.

API docs: http://localhost:8000/docs

### Single-process mode
```bash
cd frontend && npm run build       # creates frontend/dist
cd ../backend && uvicorn app.main:app --port 8000
# open http://localhost:8000 — FastAPI serves the built UI
```

### Tests
```bash
cd backend && pytest               # 24 tests: extraction, mining, AI layer, diff, full API workflow, exports
cd frontend && npm run typecheck
```

## Database
- Default: SQLite file at `backend/data/speclens.db` (created on startup).
- PostgreSQL: `pip install "psycopg[binary]"`, then set `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/speclens`. Tables are created on startup.
- Reset: delete `backend/data/` or use **Settings → Reset demo workspace**.

## AI vs demo mode
- Set `AI_API_KEY` (plus `AI_BASE_URL`, `AI_MODEL`) for any OpenAI-compatible provider (OpenAI, OpenRouter, Groq, Ollama, vLLM). Keys stay on the server.
- Without a key, a deterministic **demo engine** produces analysis and tests from linguistic rules.
- Every requirement, test case and document version is labelled **AI**, **Demo** or **Manual**. If an AI call fails, that batch falls back to the demo engine and is labelled Demo.

## Features
- **Dashboard** — KPIs, coverage ring, 14-day trend, category and test-mix charts, change alerts, activity feed, recent projects, quick actions.
- **Projects** — create, edit, delete; status, colour, coverage progress; project overview with documents, risk profile and version changes.
- **Documents** — drag-and-drop PDF upload, live processing stages, structured content viewer (outline, headings, tables, key statements, requirement markers, in-document search), version timeline, re-processing of failed uploads, original PDF view.
- **Requirement extraction** — obligation verbs, explicit IDs (FR-/NFR-/REQ-), “shall:” lists, requirement tables with MoSCoW priority; auto IDs `REQ-001`.
- **Requirement intelligence** — category, priority, risk, complexity, testability, ambiguity score and notes, suggested clarification, rationale, Given/When/Then acceptance criteria; editable, re-analysable, manual requirements.
- **Version intelligence** — requirement matching by ID and meaning (not position), added/modified/removed/unchanged, severity from semantic signals (changed values, weakened obligations, negation), impact analysis (tests flagged for review or obsolete), redline and side-by-side views, ad-hoc compare of any two versions, acknowledge alerts.
- **Test generation** — select one or many requirements; positive, negative, edge case, functional, regression; ID, requirement and criterion link, preconditions, steps, expected result, priority, test data; edit, regenerate, delete, bulk actions, manual tests.
- **Traceability** — Requirement → Acceptance Criteria → Test Cases tree, type grid, coverage by category, gap list with one-click fixes.
- **Reports** — requirements, test cases, version changes, traceability as **PDF, Excel and CSV**.
- **UX** — sidebar, breadcrumbs, project scope switcher, Ctrl/⌘K global search, toasts, skeletons, empty and error states, dialogs, light/dark mode, responsive layout.

## Project structure
```
backend/app/
  main.py, config.py, database.py, models.py, schemas.py, serializers.py
  routers/       projects, documents, requirements, changes, testcases, insights, reports, system
  services/      pdf_extractor, miner, pipeline, comparator, testgen, traceability, requirements
  services/ai/   base (types), openai_compat, demo (deterministic engine), prompts
  services/reports/  datasets, render (CSV/XLSX/PDF)
  seed/          sample PDF generator + demo seeder
backend/samples/ sample specification PDFs (banking v1.0 + v1.1, fleet, patient portal)
frontend/src/
  components/ui (design system), components/layout, components/shared, pages, context, lib
docs/ANALYSIS_AND_ARCHITECTURE.md  reference analysis, schema, API and page plan
```

## Try the version workflow yourself
1. Documents → *Sample specifications* → download `aurora_banking_srs_v1.0.pdf` and `v1.1.pdf`.
2. Upload v1.0 as a new document, generate tests on the Requirements page.
3. Open the document → **Upload new version** → v1.1 → Change Analysis shows 2 added, 6 modified, 1 removed, with flagged tests.
