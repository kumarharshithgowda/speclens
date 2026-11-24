#!/usr/bin/env bash
# Publishes SpecLens to GitHub as a series of feature-branch pull requests.
# Requirements: git, GitHub CLI (gh) logged in via `gh auth login`.
# Usage (from the speclens folder):  bash publish_to_github.sh [repo-name]
# Set MERGE=no to leave the PRs open for review instead of merging them.
set -euo pipefail

REPO="${1:-speclens}"
MERGE="${MERGE:-yes}"

command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }
[ -d .git ] && { echo "This folder is already a git repository. Remove .git to start fresh."; exit 1; }

git init -b main
git add README.md .gitignore docs
git commit -m "chore: initial scaffold with README and architecture notes"
gh repo create "$REPO" --public --source=. --remote=origin --push \
  --description "SpecLens: AI requirements intelligence (extraction, change analysis, test generation, traceability)"

pr() {
  local branch="$1" title="$2" body="$3"; shift 3
  git checkout -b "$branch" main
  git add "$@"
  git commit -m "$title"
  git push -u origin "$branch"
  gh pr create --base main --head "$branch" --title "$title" --body "$body"
  if [ "$MERGE" = "yes" ]; then
    gh pr merge "$branch" --squash --delete-branch
    git checkout main
    git pull --ff-only origin main
  else
    git checkout main
  fi
}

pr feat/backend-foundation "feat(backend): config, database and data models" \
"Adds FastAPI settings, SQLAlchemy engine (SQLite/PostgreSQL), ORM models and Pydantic schemas." \
  backend/requirements.txt backend/requirements-dev.txt backend/.env.example \
  backend/app/__init__.py backend/app/config.py backend/app/database.py \
  backend/app/models.py backend/app/schemas.py backend/app/deps.py

pr feat/pdf-extraction "feat(extraction): PDF structure extraction and requirement mining" \
"PyMuPDF-based extraction of headings, tables, lists and key statements; requirement miner for modal verbs, IDs, stems and requirement tables." \
  backend/app/services/__init__.py backend/app/services/pdf_extractor.py backend/app/services/miner.py

pr feat/ai-intelligence "feat(ai): provider abstraction, OpenAI-compatible client and demo engine" \
"Requirement analysis and test generation via any OpenAI-compatible API, with a deterministic demo engine and per-batch fallback." \
  backend/app/services/ai backend/app/services/common.py backend/app/services/requirements.py

pr feat/version-comparison "feat(versions): requirement-level comparison and processing pipeline" \
"Matches requirements by ID and meaning, scores severity from semantic signals, flags impacted tests; background processing pipeline." \
  backend/app/services/comparator.py backend/app/services/pipeline.py

pr feat/tests-trace-reports "feat(qa): test generation, traceability matrix and reports" \
"Test case generation/regeneration, requirement → criteria → test traceability, CSV/Excel/PDF reports." \
  backend/app/services/testgen.py backend/app/services/traceability.py backend/app/services/reports

pr feat/rest-api "feat(api): REST endpoints, demo seed data and test suite" \
"Routers for projects, documents, requirements, changes, test cases, insights and reports; sample PDFs; 24 pytest tests." \
  backend/app/routers backend/app/serializers.py backend/app/main.py backend/app/seed backend/samples backend/tests

pr feat/frontend "feat(frontend): SpecLens web application" \
"React + TypeScript + Vite + Tailwind UI: dashboard, projects, documents, requirements, change analysis, test cases, traceability, reports, settings." \
  frontend publish_to_github.sh

echo "Done: $(gh repo view --json url -q .url)"
