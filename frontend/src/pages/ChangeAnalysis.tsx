import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Archive, CheckCheck, Columns2, Download, FileSpreadsheet, FileText, GitCompareArrows, ListChecks, PlusCircle, Rows3, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChangeTypeBadge, Chip, SeverityBadge, severityBar } from "@/components/shared/badges";
import { ChangeSpectrum, PlainText, Redline } from "@/components/shared/change";
import { GenerateDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/shared/feedback";
import { RequirementDrawer } from "@/components/shared/RequirementDrawer";
import { FilterChip } from "@/components/shared/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { useScope } from "@/context/app";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { ChangeSet, ChangeType, RequirementChange } from "@/lib/types";
import { cn, downloadUrl, formatDate } from "@/lib/utils";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export default function ChangeAnalysis() {
  const { projectId } = useScope();
  const [params, setParams] = useSearchParams();
  const sets = useQuery({ queryKey: ["changes", { projectId }], queryFn: () => api.changeSets({ project_id: projectId }) });
  const docs = useQuery({ queryKey: ["documents", { project_id: projectId }], queryFn: () => api.documents({ project_id: projectId }) });

  const paramSet = params.get("set");
  const paramDoc = params.get("document");
  const paramTo = params.get("to");

  // Resolve which change set to show from the URL.
  const selectedId = useMemo(() => {
    const list = sets.data ?? [];
    if (paramSet) return Number(paramSet);
    if (paramDoc) {
      const forDoc = list.filter((s) => s.document_id === Number(paramDoc));
      const match = paramTo ? forDoc.find((s) => s.to_version === Number(paramTo)) : forDoc[0];
      return match?.id ?? null;
    }
    return list[0]?.id ?? null;
  }, [sets.data, paramSet, paramDoc, paramTo]);

  const [compareDoc, setCompareDoc] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adhoc, setAdhoc] = useState<{ doc: number; from: number; to: number } | null>(null);
  const multiVersionDocs = (docs.data ?? []).filter((d) => d.version_count > 1);
  const compareDocObj = multiVersionDocs.find((d) => String(d.id) === compareDoc);

  useEffect(() => {
    if (!compareDoc && multiVersionDocs[0]) setCompareDoc(String(paramDoc ?? multiVersionDocs[0].id));
  }, [multiVersionDocs, compareDoc, paramDoc]);
  useEffect(() => {
    if (compareDocObj) {
      setFrom("1");
      setTo(String(compareDocObj.current_version));
    }
  }, [compareDocObj?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id: number) => {
    setAdhoc(null);
    setParams({ set: String(id) });
  };

  return (
    <>
      <PageHeader
        title="Change Analysis"
        description="What changed between document versions, how severe each change is, and which tests it affects."
      />

      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <section className="panel">
            <header className="border-b px-4 py-3">
              <h2 className="text-[14px] font-semibold">Version updates</h2>
              <p className="text-xs text-ink-3">Analysed automatically when a new version is uploaded</p>
            </header>
            {sets.isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : sets.data?.length ? (
              <ul className="divide-y">
                {sets.data.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => select(s.id)}
                      className={cn("w-full px-4 py-3 text-left", !adhoc && s.id === selectedId ? "bg-brand-soft/60" : "hover:bg-surface-2")}
                      aria-current={!adhoc && s.id === selectedId}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.document_title}</span>
                        {!s.acknowledged && <span className="h-2 w-2 shrink-0 rounded-full bg-redline" title="Not yet acknowledged" />}
                      </div>
                      <div className="mb-2 mt-0.5 text-xs text-ink-3">
                        v{s.from_version} to v{s.to_version}, {formatDate(s.created_at)}
                      </div>
                      <ChangeSpectrum counts={s.counts} showLegend={false} height="h-1.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[13px] text-ink-3">No versions compared yet.</p>
            )}
          </section>

          {multiVersionDocs.length > 0 && (
            <section className="panel p-4">
              <h2 className="text-[14px] font-semibold">Compare any two versions</h2>
              <div className="mt-3 space-y-2.5">
                <Select size="sm" className="w-full" value={compareDoc} onChange={setCompareDoc} options={multiVersionDocs.map((d) => ({ value: String(d.id), label: d.title }))} aria-label="Document" />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [from, setFrom, "From"],
                    [to, setTo, "To"],
                  ].map(([v, set, label]) => (
                    <Select
                      key={label as string}
                      size="sm"
                      aria-label={label as string}
                      value={v as string}
                      onChange={set as (v: string) => void}
                      options={Array.from({ length: compareDocObj?.version_count ?? 0 }, (_, i) => ({ value: String(i + 1), label: `${label} v${i + 1}` }))}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!compareDoc || !from || !to || from === to}
                  onClick={() => setAdhoc({ doc: Number(compareDoc), from: Number(from), to: Number(to) })}
                >
                  <GitCompareArrows /> Compare
                </Button>
              </div>
            </section>
          )}
        </aside>

        <div className="min-w-0">
          {sets.error ? (
            <div className="panel">
              <ErrorState error={sets.error} onRetry={() => sets.refetch()} />
            </div>
          ) : adhoc ? (
            <AdhocView {...adhoc} />
          ) : selectedId ? (
            <ChangeSetView id={selectedId} />
          ) : sets.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <div className="panel">
              <EmptyState
                icon={<GitCompareArrows />}
                title="No version changes to review"
                description="Open a document and upload its newer version. SpecLens matches requirements by meaning and shows exactly what was added, modified or removed."
                action={
                  <Button asChild variant="primary">
                    <Link to="/documents">Go to documents</Link>
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ChangeSetView({ id }: { id: number }) {
  const { data: cs, isLoading, error, refetch } = useQuery({ queryKey: ["change-set", id], queryFn: () => api.changeSet(id) });
  const refresh = useRefreshAll();
  const [genOpen, setGenOpen] = useState(false);
  const [drawer, setDrawer] = useState<number | null>(null);
  const ack = useMutation({
    mutationFn: () => api.acknowledge(id),
    onSuccess: () => {
      refresh();
      toast.success("Marked as reviewed");
    },
  });

  if (error) return <div className="panel"><ErrorState error={error} onRetry={() => refetch()} /></div>;
  if (isLoading || !cs) return <Skeleton className="h-[520px] w-full" />;

  const changes = cs.changes ?? [];
  const addedIds = changes.filter((c) => c.change_type === "added" && c.requirement_id).map((c) => c.requirement_id!) as number[];
  const flagged = changes.filter((c) => c.change_type === "modified").reduce((s, c) => s + (c.affected_tests ?? 0), 0);
  const obsolete = changes.filter((c) => c.change_type === "removed").reduce((s, c) => s + (c.affected_tests ?? 0), 0);

  return (
    <div className="space-y-5">
      <Summary
        title={cs.document_title}
        subtitle={`${cs.project_name}, analysed ${formatDate(cs.created_at)}`}
        from={cs.from_version}
        to={cs.to_version}
        counts={cs.counts}
        severity={cs.severity_counts}
        summary={cs.impact_summary}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(
                  [
                    ["csv", "CSV", FileText],
                    ["xlsx", "Excel workbook", FileSpreadsheet],
                    ["pdf", "PDF report", FileText],
                  ] as const
                ).map(([fmt, label, Icon]) => (
                  <DropdownMenuItem key={fmt} onSelect={() => downloadUrl(api.reportUrl("changes", fmt, { change_set_id: cs.id }))}>
                    <Icon /> {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {cs.acknowledged ? (
              <Chip className="h-8 border-insert/30 bg-insert-soft px-3 text-insert">
                <CheckCheck /> Reviewed
              </Chip>
            ) : (
              <Button size="sm" variant="primary" onClick={() => ack.mutate()} loading={ack.isPending}>
                <CheckCheck /> Mark as reviewed
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <ImpactCard
          icon={<AlertTriangle />}
          tone="warn"
          value={flagged}
          label="Tests flagged for review"
          body="Their requirement text changed. Re-check steps and expected results."
          action={flagged > 0 && <Link to="/test-cases?status=needs_review" className="text-[13px] font-medium text-brand-ink hover:underline">Review tests</Link>}
        />
        <ImpactCard icon={<Archive />} value={obsolete} label="Tests made obsolete" body="Their requirement was removed from the document." />
        <ImpactCard
          icon={<PlusCircle />}
          tone="good"
          value={addedIds.length}
          label="New requirements without tests"
          body="Added in this version, not yet covered."
          action={
            addedIds.length > 0 && (
              <Button size="sm" variant="soft" onClick={() => setGenOpen(true)}>
                <Wand2 /> Generate tests
              </Button>
            )
          }
        />
      </div>

      <ChangeList changes={changes} from={cs.from_version} to={cs.to_version} onOpen={setDrawer} />
      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} requirementIds={addedIds} />
      <RequirementDrawer requirementId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

function AdhocView({ doc, from, to }: { doc: number; from: number; to: number }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["compare", doc, from, to], queryFn: () => api.compare(doc, from, to) });
  if (error) return <div className="panel"><ErrorState error={error} onRetry={() => refetch()} /></div>;
  if (isLoading || !data) return <Skeleton className="h-[520px] w-full" />;
  return (
    <div className="space-y-5">
      <Summary
        title={data.document_title}
        subtitle="Ad-hoc comparison of extracted requirements. Test impact is tracked only for consecutive uploads."
        from={from}
        to={to}
        counts={data.counts}
        severity={data.severity_counts}
      />
      <ChangeList changes={data.changes} from={from} to={to} />
    </div>
  );
}

function Summary({
  title,
  subtitle,
  from,
  to,
  counts,
  severity,
  summary,
  actions,
}: {
  title: string;
  subtitle: string;
  from: number;
  to: number;
  counts: ChangeSet["counts"];
  severity: Record<string, number>;
  summary?: string;
  actions?: React.ReactNode;
}) {
  const changed = counts.added + counts.modified + counts.removed;
  const maxSev = Math.max(1, ...SEVERITIES.map((s) => severity[s] ?? 0));
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="truncate text-[17px] font-semibold">{title}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-ink-2">
              v{from} <GitCompareArrows className="h-3.5 w-3.5" /> v{to}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-semibold leading-none tracking-[-0.02em] tabular">{changed}</span>
            <span className="text-[13px] text-ink-2">
              of {counts.added + counts.modified + counts.removed + counts.unchanged} requirements changed
            </span>
          </div>
          <ChangeSpectrum counts={counts} className="mt-4" height="h-3" />
          {summary && <p className="mt-4 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">{summary}</p>}
        </div>
        <div>
          <div className="mb-2.5 text-[13px] font-medium">Change severity</div>
          <div className="space-y-2">
            {SEVERITIES.map((s) => (
              <div key={s} className="grid grid-cols-[86px_1fr_28px] items-center gap-3">
                <SeverityBadge severity={s} />
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className={cn("h-full origin-left rounded-full animate-grow-x", severityBar(s))} style={{ width: `${((severity[s] ?? 0) / maxSev) * 100}%` }} />
                </div>
                <span className="text-right text-[13px] font-semibold tabular">{severity[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ImpactCard({ icon, value, label, body, action, tone }: { icon: React.ReactNode; value: number; label: string; body: string; action?: React.ReactNode; tone?: "warn" | "good" }) {
  return (
    <div className="panel flex flex-col p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-md [&_svg]:h-4 [&_svg]:w-4",
            tone === "warn" ? "bg-serious/15 text-[hsl(17_70%_42%)] dark:text-serious" : tone === "good" ? "bg-insert-soft text-insert" : "bg-ink/5 text-ink-2",
          )}
        >
          {icon}
        </span>
        <span className="text-[24px] font-semibold leading-none tabular">{value}</span>
      </div>
      <div className="mt-3 text-[13.5px] font-medium">{label}</div>
      <p className="mt-0.5 flex-1 text-xs leading-relaxed text-ink-3">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function ChangeList({ changes, from, to, onOpen }: { changes: RequirementChange[]; from: number; to: number; onOpen?: (id: number) => void }) {
  const [types, setTypes] = useState<Set<ChangeType>>(new Set(["added", "modified", "removed"]));
  const [sev, setSev] = useState("");
  const [mode, setMode] = useState<"redline" | "side">("redline");
  const counts = (t: ChangeType) => changes.filter((c) => c.change_type === t).length;
  const list = changes.filter((c) => types.has(c.change_type) && (!sev || c.severity === sev));
  const toggle = (t: ChangeType) =>
    setTypes((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        {(["added", "modified", "removed", "unchanged"] as ChangeType[]).map((t) => (
          <FilterChip key={t} active={types.has(t)} onClick={() => toggle(t)}>
            <span className="capitalize">{t}</span>
            <span className="tabular text-ink-3">{counts(t)}</span>
          </FilterChip>
        ))}
        <Select size="sm" className="w-36" value={sev} onChange={setSev} allLabel="Any severity" options={SEVERITIES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} aria-label="Severity" />
        <div className="ml-auto flex rounded-md border p-0.5" role="group" aria-label="Diff layout">
          {(
            [
              ["redline", "Redline", Rows3],
              ["side", "Side by side", Columns2],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px]", mode === value ? "bg-ink text-surface" : "text-ink-2 hover:text-ink")}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "side" && list.length > 0 && (
        <div className="hidden grid-cols-2 border-b bg-surface-2 text-xs font-medium text-ink-3 md:grid">
          <div className="px-6 py-2">Version {from}</div>
          <div className="border-l px-6 py-2">Version {to}</div>
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState className="py-10" icon={<ListChecks />} title="No changes match the filters" />
      ) : (
        <ol className="divide-y">
          {list.map((c) => (
            <li key={`${c.position}-${c.change_type}`} className="relative">
              <span className={cn("absolute inset-y-0 left-0 w-[3px]", severityBar(c.severity))} aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-2 px-5 pb-1 pt-3.5">
                {c.requirement_code &&
                  (onOpen && c.requirement_id ? (
                    <button className="code-id hover:underline" onClick={() => onOpen(c.requirement_id!)}>
                      {c.requirement_code}
                    </button>
                  ) : (
                    <span className="code-id">{c.requirement_code}</span>
                  ))}
                <ChangeTypeBadge type={c.change_type} />
                {c.severity !== "none" && <SeverityBadge severity={c.severity} />}
                {c.change_type === "modified" && <span className="text-xs tabular text-ink-3">{Math.round(c.similarity * 100)}% similar</span>}
                <span className="ml-auto max-w-[45%] truncate text-xs text-ink-3">{c.section}</span>
              </div>
              {c.signals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-5 pt-1.5">
                  {c.signals.map((s) => (
                    <Chip key={s} className="border-warning/50 bg-warning/10 font-normal text-ink">
                      {s}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="px-5 pb-3.5 pt-2">
                {mode === "redline" ? (
                  c.change_type === "modified" ? (
                    <Redline ops={c.diff} />
                  ) : (
                    <PlainText text={c.new_text || c.old_text} tone={c.change_type === "added" ? "added" : c.change_type === "removed" ? "removed" : undefined} />
                  )
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 md:gap-0">
                    <div className="rounded-md bg-surface-2 p-3 md:mr-3">
                      {c.old_text ? c.change_type === "modified" ? <Redline ops={c.diff} side="old" /> : <PlainText text={c.old_text} tone={c.change_type === "removed" ? "removed" : undefined} /> : <p className="text-[13px] italic text-ink-3">Not present in v{from}</p>}
                    </div>
                    <div className="rounded-md bg-surface-2 p-3 md:ml-3">
                      {c.new_text ? c.change_type === "modified" ? <Redline ops={c.diff} side="new" /> : <PlainText text={c.new_text} tone={c.change_type === "added" ? "added" : undefined} /> : <p className="text-[13px] italic text-ink-3">Removed in v{to}</p>}
                    </div>
                  </div>
                )}
                {c.impact && (
                  <p className="mt-2 text-xs text-ink-2">
                    <span className="font-medium text-ink">Impact: </span>
                    {c.impact}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
