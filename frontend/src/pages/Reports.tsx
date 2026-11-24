import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, GitCompareArrows, ListChecks, Network, ScrollText, Sheet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useScope } from "@/context/app";
import { api } from "@/lib/api";
import { downloadUrl } from "@/lib/utils";

const REPORTS = [
  {
    kind: "requirements",
    title: "Requirements",
    icon: ScrollText,
    body: "Every active requirement with category, priority, risk, ambiguity, suggested clarification and acceptance criteria.",
    count: (k: Counts) => `${k.requirements} requirements`,
  },
  {
    kind: "test-cases",
    title: "Test cases",
    icon: ListChecks,
    body: "The full test plan: steps, preconditions, expected results, test data, type, status and source.",
    count: (k: Counts) => `${k.test_cases} test cases`,
  },
  {
    kind: "changes",
    title: "Version changes",
    icon: GitCompareArrows,
    body: "Added, modified and removed requirements per document revision, with severity, signals and test impact.",
    count: (k: Counts) => `${k.change_sets} version comparisons`,
  },
  {
    kind: "traceability",
    title: "Traceability matrix",
    icon: Network,
    body: "Requirement → acceptance criterion → test case mapping with coverage status and uncovered criteria.",
    count: (k: Counts) => `${k.coverage}% requirement coverage`,
  },
] as const;

interface Counts {
  requirements: number;
  test_cases: number;
  change_sets: number;
  coverage: number;
}

const FORMATS = [
  { fmt: "pdf", label: "PDF", icon: FileText },
  { fmt: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { fmt: "csv", label: "CSV", icon: Sheet },
] as const;

export default function Reports() {
  const { projectId, projects } = useScope();
  const [scope, setScope] = useState(projectId ? String(projectId) : "");
  useEffect(() => setScope(projectId ? String(projectId) : ""), [projectId]);
  const pid = scope ? Number(scope) : undefined;
  const dash = useQuery({ queryKey: ["dashboard", pid], queryFn: () => api.dashboard(pid) });
  const sets = useQuery({ queryKey: ["changes", { projectId: pid }], queryFn: () => api.changeSets({ project_id: pid }) });

  const counts: Counts = {
    requirements: dash.data?.kpis.requirements ?? 0,
    test_cases: dash.data?.kpis.test_cases ?? 0,
    change_sets: sets.data?.length ?? 0,
    coverage: Math.round(dash.data?.kpis.coverage_pct ?? 0),
  };

  const download = (kind: string, fmt: string, title: string) => {
    downloadUrl(api.reportUrl(kind, fmt, { project_id: pid }));
    toast.success(`${title} report download started`, { description: `${fmt.toUpperCase()} file` });
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Download stakeholder-ready reports. PDF for reading and sharing, Excel and CSV for further analysis."
        actions={
          <Select
            className="w-56"
            value={scope}
            onChange={setScope}
            allLabel="All projects"
            options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
            aria-label="Report scope"
          />
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <article key={r.kind} className="panel flex flex-col p-5">
            <div className="flex items-start gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                <r.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold">{r.title}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.body}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="text-xs text-ink-3">{dash.isLoading ? "Counting…" : r.count(counts)}</span>
              <div className="flex gap-2">
                {FORMATS.map((f) => (
                  <Button key={f.fmt} size="sm" variant={f.fmt === "pdf" ? "primary" : "secondary"} onClick={() => download(r.kind, f.fmt, r.title)}>
                    <f.icon /> {f.label}
                  </Button>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-5 text-xs text-ink-3">
        Reports reflect the data at the time of download. Results produced by the demo engine are labelled “Demo engine” in the source column.
      </p>
    </>
  );
}
