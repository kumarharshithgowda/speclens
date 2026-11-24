import type {
  AppSettings,
  ChangeSet,
  CompareResult,
  Dashboard,
  DocumentItem,
  Project,
  Requirement,
  SearchResults,
  Section,
  TestCase,
  TestType,
  Traceability,
  Version,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

function qs(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError("Cannot reach the SpecLens API. Check that the backend is running on port 8000.", 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail[0]?.msg ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const get = <T>(path: string, params?: Params) => request<T>(path + qs(params));
const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  settings: () => get<AppSettings>("/settings"),
  testAI: () => send<{ ok: boolean; mode: string; message: string; latency_ms?: number }>("POST", "/settings/test-ai"),
  resetDemo: () => send<{ ok: boolean }>("POST", "/settings/reset-demo"),
  dashboard: (project_id?: number) => get<Dashboard>("/dashboard", { project_id }),
  search: (q: string) => get<SearchResults>("/search", { q }),

  projects: (params?: Params) => get<Project[]>("/projects", params),
  project: (id: number) => get<Project>(`/projects/${id}`),
  createProject: (body: Partial<Project>) => send<Project>("POST", "/projects", body),
  updateProject: (id: number, body: Partial<Project>) => send<Project>("PATCH", `/projects/${id}`, body),
  deleteProject: (id: number) => send<void>("DELETE", `/projects/${id}`),

  documents: (params?: Params) => get<DocumentItem[]>("/documents", params),
  document: (id: number) => get<DocumentItem>(`/documents/${id}`),
  uploadDocument: (form: FormData) => send<DocumentItem>("POST", "/documents", form),
  updateDocument: (id: number, body: { title?: string; doc_type?: string }) => send<DocumentItem>("PATCH", `/documents/${id}`, body),
  deleteDocument: (id: number) => send<void>("DELETE", `/documents/${id}`),
  uploadVersion: (id: number, form: FormData) => send<Version>("POST", `/documents/${id}/versions`, form),
  reprocess: (versionId: number) => send<Version>("POST", `/versions/${versionId}/reprocess`),
  sections: (versionId: number, q?: string) => get<Section[]>(`/versions/${versionId}/sections`, { q }),
  versionFileUrl: (versionId: number) => `/api/versions/${versionId}/file`,

  requirements: (params?: Params) => get<Requirement[]>("/requirements", params),
  requirement: (id: number) => get<Requirement>(`/requirements/${id}`),
  createRequirement: (body: { project_id: number; document_id?: number | null; description: string; title?: string; section?: string; analyze?: boolean }) =>
    send<Requirement>("POST", "/requirements", body),
  updateRequirement: (id: number, body: Partial<Requirement>) => send<Requirement>("PATCH", `/requirements/${id}`, body),
  deleteRequirement: (id: number) => send<void>("DELETE", `/requirements/${id}`),
  reanalyze: (id: number) => send<Requirement>("POST", `/requirements/${id}/reanalyze`),
  setCriteria: (id: number, criteria: string[]) => send<Requirement>("PUT", `/requirements/${id}/criteria`, { criteria }),

  testCases: (params?: Params) => get<TestCase[]>("/test-cases", params),
  generateTests: (body: { requirement_ids: number[]; types: TestType[]; per_type: number; replace_existing?: boolean }) =>
    send<{ created: number; source: string; test_cases: TestCase[] }>("POST", "/test-cases/generate", body),
  createTest: (body: Partial<TestCase>) => send<TestCase>("POST", "/test-cases", body),
  updateTest: (id: number, body: Partial<TestCase>) => send<TestCase>("PATCH", `/test-cases/${id}`, body),
  deleteTest: (id: number) => send<void>("DELETE", `/test-cases/${id}`),
  regenerateTest: (id: number) => send<TestCase>("POST", `/test-cases/${id}/regenerate`),
  bulkDeleteTests: (ids: number[]) => send<{ deleted: number }>("POST", "/test-cases/bulk-delete", { ids }),

  changeSets: (params?: Params) => get<ChangeSet[]>("/changes", params),
  changeSet: (id: number) => get<ChangeSet>(`/changes/${id}`),
  acknowledge: (id: number) => send<ChangeSet>("POST", `/changes/${id}/acknowledge`),
  compare: (documentId: number, from: number, to: number) => get<CompareResult>(`/documents/${documentId}/compare`, { from, to }),

  traceability: (params?: Params) => get<Traceability>("/traceability", params),
  reportUrl: (kind: string, fmt: string, params?: Params) => `/api/reports/${kind}.${fmt}${qs(params)}`,
  sampleUrl: (name: string) => `/api/samples/${name}`,
};
