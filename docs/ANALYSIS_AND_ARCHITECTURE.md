# SpecLens — Reference Analysis & Product Architecture

## Phase 1 — Technical analysis of the reference project (DocTrace AI)

**Problem it solves.** QA teams receive specification PDFs that evolve over time. Turning those documents into test cases is manual, and every new revision forces someone to work out by hand which tests are now stale. DocTrace AI automates three pieces of that: structural extraction from PDFs, change detection between versions, and LLM-generated test cases for a user-chosen slice of the document.

**Shape of the system.** A backend-only FastAPI service (no UI) using Clean Architecture layers: `domain` → `services` → `repositories` (protocol interfaces) → `api`. Persistence is split across SQLite/PostgreSQL (documents, versions, nodes, selections), MongoDB (generated test cases) and Redis (rate limiting, JWT blacklist). It ships with Docker, Kubernetes, Helm, OpenTelemetry and ~320 tests.

**Workflow.**
1. `POST /documents` uploads a PDF → `Version 1` is created with status `processing`; parsing runs as a background task.
2. Parser pipeline (PyMuPDF + pdfplumber): raw blocks → heading detection (font-size ratio vs. body font, bold flags, numbered-prefix regex, confidence ≥ 0.8) → list detection → table extraction (markdown) → hierarchy builder producing a node tree with materialised paths (`0.2.1`), position index and SHA-256 content hash.
3. `POST /documents/{id}/versions` uploads a revision; `GET /versions/{id}/diff` runs a **position-anchored hash diff**: same hash ±3 positions → unchanged/moved; unmatched nodes at the same position → modified; leftovers → added/deleted.
4. `POST /selections` stores a set of node IDs; `POST /selections/{id}/generate` sends node text to Gemini via OpenRouter with a fixed system prompt, validates JSON with Pydantic (coercing strings into lists) and stores results in MongoDB.

**Data model.** `documents`, `versions` (status, error), `nodes` (type, heading level, parent, path, position, hash, content), `selections`, plus Mongo `generations` holding test cases `{id, title, objective, preconditions, steps, expected_result, node_refs}`.

**AI integration.** Single provider (OpenRouter), retries with Tenacity, a circuit breaker, and a validator. There is no fallback: without a key nothing can be generated.

**Limitations / improvement opportunities.**
| Area | Limitation in reference | SpecLens response |
|---|---|---|
| Unit of work | Works on generic *nodes* (paragraphs, headings); it never identifies what a *requirement* is | Dedicated requirement miner (modal verbs, explicit IDs, list stems, requirement tables) with stable IDs `REQ-001` |
| Requirement intelligence | None — no category, priority, risk, ambiguity or acceptance criteria | Full per-requirement analysis, editable, with source label (AI / Demo / Manual) |
| Version diff | Positional: inserting one paragraph near the top shifts positions and inflates "modified"; no severity or impact | Content-similarity matching on requirements (explicit-ID anchor → best-similarity pairing), word-level diff, severity scoring and test-impact analysis |
| Traceability | Only `node_refs` inside generated JSON | First-class Requirement → Acceptance Criterion → Test Case links, coverage stats and gap detection |
| Test cases | Immutable generation blobs in MongoDB | Editable, regenerable, deletable test cases in SQL with type, priority, test data, status; flagged *needs review* when their requirement changes |
| Infra weight | Requires MongoDB + Redis + an LLM key to do anything | One SQL database, zero external services; deterministic demo mode when no key exists |
| UI / export | No UI, no export | Full SaaS frontend, CSV / Excel / PDF reports |

## Phase 2 — SpecLens architecture

### Product
**SpecLens** — *requirements intelligence for QA teams.* Upload specs, get structured requirements, see exactly what changed between revisions, generate test plans and prove coverage.

### System overview
```
React (Vite, TS, Tailwind, Radix, Recharts, React Query)
        │  REST /api/*  (Vite proxy in dev; FastAPI serves dist/ in prod)
FastAPI routers ── services ──┬── pdf/extractor.py      (PyMuPDF: blocks, headings, tables, statements)
        │                     ├── pdf/miner.py          (requirement candidates)
        │                     ├── ai/ (provider abstraction)
        │                     │     ├── openai_compat.py (any OpenAI-compatible endpoint)
        │                     │     └── demo.py          (deterministic heuristic engine)
        │                     ├── pipeline.py           (upload → extract → mine → analyse → compare)
        │                     ├── comparator.py         (requirement-level version diff)
        │                     ├── testgen.py, traceability.py, reports/
        │
SQLAlchemy 2.0 ORM ── SQLite (default) / PostgreSQL (via DATABASE_URL)
```
Design choices: synchronous SQLAlchemy (simpler, portable), FastAPI `BackgroundTasks` for PDF processing with stage/progress columns polled by the UI, JSON columns only for list-shaped data (steps, preconditions), no vendor-specific SQL so the same models run on PostgreSQL.

### Database schema
| Table | Key columns |
|---|---|
| `projects` | id, name, description, color, status (active/on_hold/completed/archived), timestamps |
| `documents` | id, project_id→projects, title, doc_type, current_version, timestamps |
| `document_versions` | id, document_id, version_number, filename, file_path, file_size, page_count, status (queued/processing/ready/failed), stage, progress, error, stats JSON, snapshot JSON (extracted requirements for any-version compare), analysis_source |
| `sections` | id, version_id, order, kind (heading/paragraph/list/table/statement), level, heading_path, text, page, table JSON |
| `requirements` | id, project_id, document_id, code (REQ-###), external_id, title, description, source_text, section, page, category, priority, risk, complexity, testable, ambiguity_score, ambiguity_notes, clarification, status (active/removed), review_status, analysis_source, introduced_version, last_changed_version, edited |
| `acceptance_criteria` | id, requirement_id, code (AC-###.n), text, position |
| `test_cases` | id, project_id, requirement_id, criterion_id?, code (TC-####), title, scenario, preconditions JSON, steps JSON, expected_result, test_type, priority, test_data, status (draft/ready/needs_review/obsolete), source |
| `change_sets` | id, document_id, from_version, to_version, counts JSON, impact_summary, created_at |
| `requirement_changes` | id, change_set_id, requirement_id?, change_type (added/modified/removed/unchanged), old_text, new_text, similarity, severity, impact, affected_tests |
| `activities` | id, project_id?, kind, message, created_at |

### REST API (prefix `/api`)
- `GET /health`, `GET /settings`, `POST /settings/test-ai`, `POST /settings/reset-demo`
- `GET /dashboard`, `GET /search?q=`
- Projects: `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`
- Documents: `GET /documents`, `POST /documents` (multipart), `GET/PATCH/DELETE /documents/{id}`, `POST /documents/{id}/versions`, `GET /documents/{id}/versions`, `GET /versions/{id}`, `GET /versions/{id}/sections`, `GET /versions/{id}/file`
- Requirements: `GET /requirements` (filters), `POST /requirements`, `GET/PATCH/DELETE /requirements/{id}`, `POST /requirements/{id}/reanalyze`, `PUT /requirements/{id}/criteria`
- Changes: `GET /changes` (change sets), `GET /changes/{id}`, `GET /documents/{id}/compare?from=&to=`
- Test cases: `GET /test-cases`, `POST /test-cases/generate`, `POST /test-cases`, `GET/PATCH/DELETE /test-cases/{id}`, `POST /test-cases/{id}/regenerate`, `POST /test-cases/bulk-delete`
- Traceability: `GET /traceability?project_id=`
- Reports: `GET /reports/{requirements|test-cases|changes|traceability}.{csv|xlsx|pdf}`

### UI page structure
Sidebar (Dashboard, Projects, Documents, Requirements, Change Analysis, Test Cases, Traceability, Reports, Settings) + top bar (breadcrumbs, global project scope, ⌘K search, AI/demo indicator, theme toggle).
- **Dashboard** – KPI tiles, coverage gauge, requirements-by-category chart, test-type mix, activity feed, recent projects, change alerts, quick actions.
- **Projects / Project overview** – card grid with status + progress, CRUD dialogs; overview with documents, coverage, risk profile, recent changes.
- **Documents / Document workspace** – drag-and-drop upload with live processing stages, version timeline, outline + structured content viewer (tables, highlighted statements, search), extracted requirements.
- **Requirements** – filterable table, multi-select → generate tests, detail drawer with intelligence panel, edit form and acceptance-criteria editor.
- **Change Analysis** – version picker, change-mix bar, severity breakdown, impact panel, filterable change list and side-by-side word-level diff.
- **Test Cases** – filterable table, generation wizard, editor dialog, regenerate / delete / bulk actions, export.
- **Traceability** – coverage KPIs, coverage by category, expandable REQ → AC → TC tree matrix, gap list.
- **Reports** – four report types × CSV / Excel / PDF.
- **Settings** – AI provider status + connection test, appearance, demo data reset.
