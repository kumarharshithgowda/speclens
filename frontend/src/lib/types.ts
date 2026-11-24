export type Level = "Low" | "Medium" | "High" | "Critical";
export type Source = "ai" | "demo" | "manual" | "mixed";
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
export type TestType = "positive" | "negative" | "edge_case" | "functional" | "regression";
export type TestStatus = "draft" | "ready" | "needs_review" | "obsolete";
export type ChangeType = "added" | "modified" | "removed" | "unchanged";
export type Severity = "none" | "low" | "medium" | "high" | "critical";

export interface ProjectStats {
  documents: number;
  requirements: number;
  test_cases: number;
  coverage_pct: number;
  open_alerts: number;
  needs_review: number;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  stats: ProjectStats;
}

export interface Version {
  id: number;
  document_id: number;
  version_number: number;
  label: string;
  filename: string;
  file_size: number;
  page_count: number;
  status: "queued" | "processing" | "ready" | "failed";
  stage: string;
  progress: number;
  error: string | null;
  stats: Record<string, number>;
  analysis_source: Source;
  uploaded_at: string;
  processed_at: string | null;
}

export interface DocumentItem {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  doc_type: string;
  current_version: number;
  created_at: string;
  updated_at: string;
  latest_version: Version | null;
  version_count: number;
  requirement_count: number;
  versions?: Version[];
}

export interface Section {
  id: number;
  position: number;
  kind: "heading" | "paragraph" | "list" | "table" | "statement";
  level: number;
  heading_path: string;
  text: string;
  page: number;
  table: string[][] | null;
  is_requirement: boolean;
}

export interface Criterion {
  id: number;
  code: string;
  text: string;
  position: number;
}

export interface Requirement {
  id: number;
  project_id: number;
  document_id: number | null;
  document_title: string | null;
  code: string;
  external_id: string | null;
  title: string;
  description: string;
  source_text: string;
  section: string;
  page: number | null;
  category: string;
  priority: Level;
  risk: Level;
  complexity: "Low" | "Medium" | "High";
  testable: boolean;
  ambiguity_score: number;
  ambiguity_notes: string;
  clarification: string;
  rationale: string;
  status: "active" | "removed";
  review_status: "draft" | "reviewed" | "approved";
  analysis_source: Source;
  introduced_version: number;
  last_changed_version: number;
  edited: boolean;
  created_at: string;
  updated_at: string;
  criteria: Criterion[];
  test_count: number;
  needs_review: number;
}

export interface TestCase {
  id: number;
  project_id: number;
  requirement_id: number;
  requirement_code: string;
  requirement_title: string;
  criterion_id: number | null;
  criterion_code: string | null;
  code: string;
  title: string;
  scenario: string;
  preconditions: string[];
  steps: string[];
  expected_result: string;
  test_type: TestType;
  priority: Level;
  test_data: string;
  status: TestStatus;
  source: Source;
  created_at: string;
  updated_at: string;
}

export interface DiffOp {
  op: "equal" | "insert" | "delete";
  text: string;
}

export interface RequirementChange {
  id?: number;
  requirement_id?: number | null;
  requirement_code?: string;
  position: number;
  change_type: ChangeType;
  section: string;
  old_text: string;
  new_text: string;
  similarity: number;
  severity: Severity;
  impact?: string;
  signals: string[];
  affected_tests?: number;
  diff: DiffOp[];
}

export interface ChangeSet {
  id: number;
  document_id: number;
  document_title: string;
  project_id: number | null;
  project_name: string;
  from_version: number;
  to_version: number;
  counts: Record<ChangeType, number>;
  severity_counts: Record<string, number>;
  impact_summary: string;
  affected_tests: number;
  acknowledged: boolean;
  created_at: string;
  changes?: RequirementChange[];
}

export interface CompareResult {
  document_id: number;
  document_title: string;
  from_version: number;
  to_version: number;
  counts: Record<ChangeType, number>;
  severity_counts: Record<string, number>;
  changes: RequirementChange[];
}

export interface TestBrief {
  id: number;
  code: string;
  title: string;
  test_type: TestType;
  status: TestStatus;
  priority: Level;
  source: Source;
}

export interface TraceRow {
  id: number;
  code: string;
  title: string;
  category: string;
  priority: Level;
  risk: Level;
  testable: boolean;
  document: string | null;
  document_id: number | null;
  project_id: number;
  status: "covered" | "partial" | "uncovered";
  criteria: { id: number; code: string; text: string; tests: TestBrief[] }[];
  unlinked_tests: TestBrief[];
  test_count: number;
  needs_review: number;
  criteria_covered: number;
  criteria_total: number;
}

export interface Gap {
  type: "uncovered" | "criteria_gap" | "needs_review" | "untestable";
  severity: "high" | "medium" | "low";
  requirement_id: number;
  code: string;
  message: string;
}

export interface Traceability {
  summary: {
    requirements: number;
    covered: number;
    partial: number;
    uncovered: number;
    criteria: number;
    criteria_covered: number;
    tests: number;
    needs_review: number;
    coverage_pct: number;
    full_coverage_pct: number;
    criteria_coverage_pct: number;
  };
  by_category: { category: string; total: number; covered: number; partial: number; uncovered: number }[];
  rows: TraceRow[];
  gaps: Gap[];
}

export interface Activity {
  id: number;
  kind: string;
  message: string;
  link: string;
  created_at: string;
  project_id: number | null;
}

export interface Dashboard {
  kpis: {
    projects: number;
    documents: number;
    versions: number;
    requirements: number;
    test_cases: number;
    coverage_pct: number;
    criteria_coverage_pct: number;
    uncovered: number;
    needs_review: number;
    ambiguous: number;
    high_risk: number;
    processing: number;
  };
  by_category: { name: string; value: number }[];
  by_priority: { name: Level; value: number }[];
  by_risk: { name: Level; value: number }[];
  test_types: { name: TestType; value: number }[];
  coverage: { covered: number; partial: number; uncovered: number };
  trend: { date: string; requirements: number; test_cases: number }[];
  activity: Activity[];
  recent_projects: Project[];
  alerts: ChangeSet[];
}

export interface AppSettings {
  app_name: string;
  ai: { mode: "ai" | "demo"; configured: boolean; model: string | null; provider_host: string | null; batch_size: number };
  limits: { max_upload_mb: number };
  database: string;
  samples: { name: string; title: string; subtitle: string }[];
}

export interface SearchResults {
  projects: SearchHit[];
  documents: SearchHit[];
  requirements: SearchHit[];
  test_cases: SearchHit[];
}
export interface SearchHit {
  id: number;
  title: string;
  subtitle: string;
}
