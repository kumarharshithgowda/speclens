import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleSlash, Grid3x3, ListTree, Network, Search, Wand2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chip, LevelBadge } from "@/components/shared/badges";
import { StackedCoverageBars } from "@/components/shared/charts";
import { GenerateDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton, StatTile } from "@/components/shared/feedback";
import { RequirementDrawer } from "@/components/shared/RequirementDrawer";
import { FilterChip } from "@/components/shared/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/overlay";
import { useScope } from "@/context/app";
import { api } from "@/lib/api";
import type { Gap, TestBrief, TraceRow } from "@/lib/types";
import { cn, TEST_TYPE_LABEL, TEST_TYPES } from "@/lib/utils";

const COVERAGE_STYLE: Record<TraceRow["status"], { label: string; cls: string }> = {
  covered: { label: "Covered", cls: "border-insert/30 bg-insert-soft text-insert" },
  partial: { label: "Partial", cls: "border-warning/60 bg-warning/10 text-ink" },
  uncovered: { label: "Uncovered", cls: "border-redline/30 bg-redline-soft text-redline" },
};

export default function Traceability() {
  const { projectId, currentProject } = useScope();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["traceability", projectId], queryFn: () => api.traceability({ project_id: projectId }) });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Set<TraceRow["status"]>>(new Set(["covered", "partial", "uncovered"]));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"tree" | "grid">("tree");
  const [gen, setGen] = useState<number[]>([]);
  const [drawer, setDrawer] = useState<number | null>(null);

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => status.has(r.status) && (!q || `${r.code} ${r.title}`.toLowerCase().includes(q.toLowerCase()))),
    [data, status, q],
  );
  const uncoveredIds = (data?.rows ?? []).filter((r) => r.status === "uncovered").map((r) => r.id);

  if (error)
    return (
      <div className="panel">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );

  const s = data?.summary;
  return (
    <>
      <PageHeader
        title="Traceability"
        description={`Requirement → acceptance criterion → test case${currentProject ? ` for ${currentProject.name}` : " across all projects"}. Gaps show where testing is missing.`}
        actions={
          <Button variant="primary" disabled={!uncoveredIds.length} onClick={() => setGen(uncoveredIds)}>
            <Wand2 /> Cover {uncoveredIds.length} gaps
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Requirement coverage" value={s ? `${Math.round(s.coverage_pct)}%` : "–"} hint={s ? `${s.covered + s.partial} of ${s.requirements} have tests` : undefined} />
        <StatTile label="Criteria verified" value={s ? `${Math.round(s.criteria_coverage_pct)}%` : "–"} hint={s ? `${s.criteria_covered} of ${s.criteria} criteria` : undefined} />
        <StatTile label="Uncovered requirements" value={s?.uncovered ?? "–"} tone={s?.uncovered ? "warn" : "good"} hint={s?.partial ? `${s.partial} more only partially covered` : "No partial coverage"} />
        <StatTile label="Tests needing review" value={s?.needs_review ?? "–"} tone={s?.needs_review ? "warn" : "good"} hint="After requirement changes" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Panel title="Coverage by category" description="Covered, partially covered and uncovered requirements" bodyClassName="p-4">
          {isLoading ? <Skeleton className="h-40 w-full" /> : data?.by_category.length ? <StackedCoverageBars data={data.by_category} /> : <p className="py-6 text-center text-[13px] text-ink-3">No requirements.</p>}
          <div className="mt-4 flex gap-4 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-insert" /> Covered</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> Partial</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-redline/70" /> Uncovered</span>
          </div>
        </Panel>
        <GapList gaps={data?.gaps ?? []} loading={isLoading} onOpen={setDrawer} onGenerate={(id) => setGen([id])} />
      </div>

      <section className="panel mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <h2 className="mr-2 text-[14px] font-semibold">Matrix</h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter requirements" className="h-8 pl-9" aria-label="Filter requirements" />
          </div>
          {(["covered", "partial", "uncovered"] as const).map((k) => (
            <FilterChip
              key={k}
              active={status.has(k)}
              onClick={() =>
                setStatus((cur) => {
                  const n = new Set(cur);
                  if (n.has(k)) n.delete(k);
                  else n.add(k);
                  return n;
                })
              }
            >
              {COVERAGE_STYLE[k].label}
              <span className="tabular text-ink-3">{s?.[k] ?? 0}</span>
            </FilterChip>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {view === "tree" && (
              <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded.size ? new Set() : new Set(rows.map((r) => r.id)))}>
                {expanded.size ? <ChevronsDownUp /> : <ChevronsUpDown />} {expanded.size ? "Collapse all" : "Expand all"}
              </Button>
            )}
            <div className="flex rounded-md border p-0.5" role="group" aria-label="Matrix view">
              {(
                [
                  ["tree", "Trace tree", ListTree],
                  ["grid", "Type grid", Grid3x3],
                ] as const
              ).map(([v, label, Icon]) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={cn("inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px]", view === v ? "bg-ink text-surface" : "text-ink-2 hover:text-ink")}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Network />} title={data?.rows.length ? "No requirements match" : "Nothing to trace yet"} description={data?.rows.length ? "Adjust the filters above." : "Upload a document and generate tests to build the matrix."} />
        ) : view === "tree" ? (
          <TraceTree rows={rows} expanded={expanded} setExpanded={setExpanded} onOpen={setDrawer} onGenerate={(id) => setGen([id])} />
        ) : (
          <TypeGrid rows={rows} onOpen={setDrawer} />
        )}
      </section>

      <GenerateDialog open={gen.length > 0} onOpenChange={(o) => !o && setGen([])} requirementIds={gen} />
      <RequirementDrawer requirementId={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function TestChip({ t }: { t: TestBrief }) {
  return (
    <Tooltip content={`${t.title} (${TEST_TYPE_LABEL[t.test_type]})`}>
      <Link
        to={`/test-cases?focus=${t.id}`}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-mono text-[11.5px] hover:border-brand hover:text-brand-ink",
          t.status === "needs_review" ? "border-serious/50 bg-serious/10 text-ink" : "bg-surface text-ink-2",
        )}
      >
        {t.status === "needs_review" && <AlertTriangle className="h-3 w-3" />}
        {t.code}
      </Link>
    </Tooltip>
  );
}

function TraceTree({
  rows,
  expanded,
  setExpanded,
  onOpen,
  onGenerate,
}: {
  rows: TraceRow[];
  expanded: Set<number>;
  setExpanded: (fn: (s: Set<number>) => Set<number>) => void;
  onOpen: (id: number) => void;
  onGenerate: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b bg-surface-2 text-left text-xs text-ink-3">
            <th className="w-8" />
            <th className="px-3 py-2.5 font-medium">Requirement</th>
            <th className="px-3 py-2.5 font-medium">Priority</th>
            <th className="px-3 py-2.5 font-medium">Criteria verified</th>
            <th className="px-3 py-2.5 text-right font-medium">Tests</th>
            <th className="px-3 py-2.5 font-medium">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = expanded.has(r.id);
            return (
              <Fragment key={r.id}>
                <tr
                  className={cn("cursor-pointer border-b hover:bg-surface-2", open && "bg-surface-2")}
                  onClick={() =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                  aria-expanded={open}
                >
                  <td className="pl-4">
                    <ChevronRight className={cn("h-4 w-4 text-ink-3 transition-transform", open && "rotate-90")} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="code-id mr-2">{r.code}</span>
                    <span className="font-medium">{r.title}</span>
                    {r.document && <span className="ml-2 text-xs text-ink-3">{r.document}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <LevelBadge level={r.priority} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1">
                      {r.criteria.map((c) => (
                        <span key={c.id} className={cn("h-2.5 w-2.5 rounded-[3px]", c.tests.length ? "bg-insert" : "border border-ink-3/50")} title={`${c.code}: ${c.tests.length ? "verified" : "no test"}`} />
                      ))}
                      <span className="ml-1.5 text-xs tabular text-ink-3">
                        {r.criteria_covered}/{r.criteria_total}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular">
                    {r.needs_review > 0 && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-[hsl(17_70%_48%)]" />}
                    {r.test_count}
                  </td>
                  <td className="px-3 py-2.5">
                    <Chip className={COVERAGE_STYLE[r.status].cls}>{COVERAGE_STYLE[r.status].label}</Chip>
                  </td>
                </tr>
                {open && (
                  <tr className="border-b bg-surface-2/60">
                    <td />
                    <td colSpan={5} className="px-3 pb-4 pt-1">
                      <div className="relative ml-1 space-y-2 border-l-2 border-line pl-5">
                        {r.criteria.map((c) => (
                          <div key={c.id} className="relative rounded-md border bg-surface p-3 before:absolute before:-left-5 before:top-5 before:h-px before:w-5 before:bg-line">
                            <div className="flex flex-wrap items-start gap-3">
                              <span className="code-id shrink-0 text-[11.5px]">{c.code}</span>
                              <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">{c.text}</p>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-0 sm:pl-[72px]">
                              {c.tests.length ? (
                                c.tests.map((t) => <TestChip key={t.id} t={t} />)
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-redline">
                                  <CircleSlash className="h-3.5 w-3.5" /> Not verified by any test
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {r.unlinked_tests.length > 0 && (
                          <div className="relative rounded-md border border-dashed bg-surface p-3 before:absolute before:-left-5 before:top-5 before:h-px before:w-5 before:bg-line">
                            <div className="mb-2 text-xs text-ink-3">Tests not linked to a specific criterion</div>
                            <div className="flex flex-wrap gap-1.5">
                              {r.unlinked_tests.map((t) => <TestChip key={t.id} t={t} />)}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)}>
                            Open requirement
                          </Button>
                          <Button size="sm" variant="soft" onClick={() => onGenerate(r.id)}>
                            <Wand2 /> Generate tests
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TypeGrid({ rows, onOpen }: { rows: TraceRow[]; onOpen: (id: number) => void }) {
  const counts = (r: TraceRow, type: string) => [...r.criteria.flatMap((c) => c.tests), ...r.unlinked_tests].filter((t) => t.test_type === type).length;
  const shade = (n: number) => (n === 0 ? "" : n === 1 ? "bg-[#cde2fb] dark:bg-[#184f95]" : n === 2 ? "bg-[#86b6ef] dark:bg-[#256abf]" : "bg-[#3987e5] text-white dark:bg-[#5598e7]");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b bg-surface-2 text-xs text-ink-3">
            <th className="px-4 py-2.5 text-left font-medium">Requirement</th>
            {TEST_TYPES.map((t) => (
              <th key={t} className="w-[96px] px-2 py-2.5 text-center font-medium">
                {TEST_TYPE_LABEL[t]}
              </th>
            ))}
            <th className="w-24 px-3 py-2.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-2">
              <td className="px-4 py-2">
                <button onClick={() => onOpen(r.id)} className="text-left hover:text-brand-ink">
                  <span className="code-id mr-2">{r.code}</span>
                  <span className="font-medium">{r.title}</span>
                </button>
              </td>
              {TEST_TYPES.map((t) => {
                const n = counts(r, t);
                return (
                  <td key={t} className="p-1">
                    <div className={cn("grid h-8 place-items-center rounded-[4px] text-[12px] font-medium tabular", n ? shade(n) : "border border-dashed text-ink-3")} title={`${n} ${TEST_TYPE_LABEL[t].toLowerCase()} test(s)`}>
                      {n || "–"}
                    </div>
                  </td>
                );
              })}
              <td className="px-3 py-2">
                <Chip className={COVERAGE_STYLE[r.status].cls}>{COVERAGE_STYLE[r.status].label}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t px-4 py-2.5 text-xs text-ink-3">
        Tests per type
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("grid h-5 w-7 place-items-center rounded-[3px] text-[11px]", shade(n))}>
            {n === 3 ? "3+" : n}
          </span>
        ))}
      </div>
    </div>
  );
}

const GAP_META: Record<Gap["type"], { label: string }> = {
  uncovered: { label: "No tests" },
  criteria_gap: { label: "Criteria gap" },
  needs_review: { label: "Needs review" },
  untestable: { label: "Not testable" },
};

function GapList({ gaps, loading, onOpen, onGenerate }: { gaps: Gap[]; loading: boolean; onOpen: (id: number) => void; onGenerate: (id: number) => void }) {
  return (
    <Panel title="Testing gaps" description={`${gaps.length} issues, most severe first`}>
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : gaps.length === 0 ? (
        <EmptyState className="py-10" icon={<Network />} title="No gaps" description="Every requirement is covered and every test is current." />
      ) : (
        <ul className="max-h-[300px] divide-y overflow-y-auto scrollbar-thin">
          {gaps.map((g, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-2.5">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", g.severity === "high" ? "bg-critical" : "bg-warning")} aria-label={`${g.severity} severity`} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-snug">{g.message}</div>
                <div className="mt-0.5 text-xs text-ink-3">{GAP_META[g.type].label}</div>
              </div>
              {g.type === "uncovered" || g.type === "criteria_gap" ? (
                <Button size="sm" variant="ghost" onClick={() => onGenerate(g.requirement_id)}>
                  <Wand2 /> Generate
                </Button>
              ) : g.type === "needs_review" ? (
                <Button asChild size="sm" variant="ghost">
                  <Link to="/test-cases?status=needs_review">Review</Link>
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onOpen(g.requirement_id)}>
                  Clarify
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
