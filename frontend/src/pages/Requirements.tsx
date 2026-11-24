import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Download, FileSpreadsheet, FileText, Plus, ScrollText, Search, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AmbiguityMeter, CategoryTag, LevelBadge, SourceBadge } from "@/components/shared/badges";
import { GenerateDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/shared/feedback";
import { RequirementDrawer } from "@/components/shared/RequirementDrawer";
import { compareBy, FilterChip, Pagination, SelectionBar, SortHeader, type SortState } from "@/components/shared/table";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Switch, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { useScope } from "@/context/app";
import { api } from "@/lib/api";
import { useDebounced, usePagination, useRefreshAll } from "@/lib/hooks";
import type { Requirement } from "@/lib/types";
import { CATEGORIES, cn, downloadUrl, LEVELS } from "@/lib/utils";

type SortKey = "code" | "title" | "priority" | "risk" | "ambiguity_score" | "test_count";

export default function Requirements() {
  const { projectId, currentProject } = useScope();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [risk, setRisk] = useState("");
  const [coverage, setCoverage] = useState(params.get("coverage") ?? "");
  const [ambiguous, setAmbiguous] = useState(false);
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [genOpen, setGenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const focus = params.get("focus");
  const [drawer, setDrawer] = useState<number | null>(focus ? Number(focus) : null);

  useEffect(() => {
    if (focus) setDrawer(Number(focus));
  }, [focus]);

  const filters = {
    project_id: projectId,
    q: query,
    category,
    priority,
    risk,
    coverage,
    ambiguous: ambiguous ? true : undefined,
    status_filter: status,
  };
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["requirements", filters],
    queryFn: () => api.requirements(filters),
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    if (sort) list.sort((a, b) => compareBy(a, b, sort.key) * (sort.dir === "asc" ? 1 : -1));
    return list;
  }, [data, sort]);
  const pager = usePagination(rows, 25);
  const activeFilters = [category, priority, risk, coverage].filter(Boolean).length + (ambiguous ? 1 : 0) + (query ? 1 : 0);

  useEffect(() => setSelected(new Set()), [projectId, status]);

  const pageIds = pager.slice.filter((r) => r.status === "active").map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const clearFilters = () => {
    setQ("");
    setCategory("");
    setPriority("");
    setRisk("");
    setCoverage("");
    setAmbiguous(false);
    if (params.get("coverage")) setParams({});
  };

  const closeDrawer = () => {
    setDrawer(null);
    if (focus) {
      params.delete("focus");
      setParams(params, { replace: true });
    }
  };

  const reportParams = { project_id: projectId };
  return (
    <>
      <PageHeader
        title="Requirements"
        description={
          currentProject
            ? `Extracted and analysed requirements in ${currentProject.name}.`
            : "Every extracted requirement with its AI analysis. Select requirements to generate tests."
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => downloadUrl(api.reportUrl("requirements", "csv", reportParams))}>
                  <FileText /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadUrl(api.reportUrl("requirements", "xlsx", reportParams))}>
                  <FileSpreadsheet /> Excel workbook
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadUrl(api.reportUrl("requirements", "pdf", reportParams))}>
                  <FileText /> PDF report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add requirement
            </Button>
            <Button variant="primary" disabled={selected.size === 0} onClick={() => setGenOpen(true)}>
              <Wand2 /> Generate tests{selected.size ? ` (${selected.size})` : ""}
            </Button>
          </>
        }
      />

      <div className="panel overflow-hidden">
        <div className="space-y-3 border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ID, title or text" className="h-8 pl-9" aria-label="Search requirements" />
            </div>
            <Select size="sm" className="w-36" value={category} onChange={setCategory} allLabel="All categories" options={CATEGORIES.map((c) => ({ value: c, label: c }))} aria-label="Category" />
            <Select size="sm" className="w-32" value={priority} onChange={setPriority} allLabel="Any priority" options={LEVELS.map((c) => ({ value: c, label: `${c} priority` }))} aria-label="Priority" />
            <Select size="sm" className="w-28" value={risk} onChange={setRisk} allLabel="Any risk" options={LEVELS.map((c) => ({ value: c, label: `${c} risk` }))} aria-label="Risk" />
            <Select
              size="sm"
              className="w-36"
              value={coverage}
              onChange={setCoverage}
              allLabel="Any coverage"
              options={[
                { value: "uncovered", label: "Without tests" },
                { value: "covered", label: "With tests" },
              ]}
              aria-label="Coverage"
            />
            <FilterChip active={ambiguous} onClick={() => setAmbiguous((v) => !v)}>
              <AlertTriangle /> Ambiguous
            </FilterChip>
            <Select
              size="sm"
              className="w-32"
              value={status}
              onChange={(v) => setStatus(v || "active")}
              options={[
                { value: "active", label: "Active" },
                { value: "removed", label: "Removed" },
                { value: "all", label: "All statuses" },
              ]}
              aria-label="Status"
            />
            {activeFilters > 0 && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X /> Clear filters
              </Button>
            )}
            <span className={cn("ml-auto text-xs text-ink-3 transition-opacity", isFetching && "opacity-50")}>{rows.length} requirements</span>
          </div>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          activeFilters ? (
            <EmptyState icon={<Search />} title="No requirements match these filters" action={<Button onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={<ScrollText />} title="No requirements yet" description="Upload a specification on the Documents page, or add a requirement manually." action={<Button onClick={() => setAddOpen(true)}><Plus /> Add requirement</Button>} />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b bg-surface-2 text-left text-xs text-ink-3">
                    <th className="w-10 px-4 py-2.5">
                      <Checkbox
                        aria-label="Select all on page"
                        checked={allOnPage}
                        indeterminate={!allOnPage && someOnPage}
                        onCheckedChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            pageIds.forEach((id) => (allOnPage ? n.delete(id) : n.add(id)));
                            return n;
                          })
                        }
                      />
                    </th>
                    <SortHeader label="ID" k="code" sort={sort} onSort={setSort} className="w-20 pl-0" />
                    <SortHeader label="Requirement" k="title" sort={sort} onSort={setSort} />
                    <th className="px-3 py-2.5 font-medium">Category</th>
                    <SortHeader label="Priority" k="priority" sort={sort} onSort={setSort} />
                    <SortHeader label="Risk" k="risk" sort={sort} onSort={setSort} />
                    <SortHeader label="Clarity" k="ambiguity_score" sort={sort} onSort={setSort} />
                    <SortHeader label="Tests" k="test_count" sort={sort} onSort={setSort} align="right" className="text-right" />
                    <th className="px-3 py-2.5 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pager.slice.map((r) => (
                    <Row key={r.id} r={r} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} onOpen={() => setDrawer(r.id)} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pager} />
          </>
        )}
      </div>

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="primary" onClick={() => setGenOpen(true)}>
          <Wand2 /> Generate tests
        </Button>
      </SelectionBar>
      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} requirementIds={[...selected]} onDone={() => setSelected(new Set())} />
      <RequirementDrawer requirementId={drawer} onClose={closeDrawer} />
      <AddRequirementDialog open={addOpen} onOpenChange={setAddOpen} onCreated={(id) => setDrawer(id)} />
    </>
  );
}

function Row({ r, selected, onToggle, onOpen }: { r: Requirement; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <tr className={cn("group cursor-pointer", selected ? "bg-brand-soft/50" : "hover:bg-surface-2", r.status === "removed" && "opacity-60")} onClick={onOpen}>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${r.code}`} disabled={r.status !== "active"} />
      </td>
      <td className="py-3 pr-3 align-top">
        <span className="code-id">{r.code}</span>
        {r.external_id && <div className="mt-0.5 font-mono text-[11px] text-ink-3">{r.external_id}</div>}
      </td>
      <td className="max-w-[460px] px-3 py-3">
        <div className={cn("font-medium text-ink group-hover:text-brand-ink", r.status === "removed" && "line-through")}>{r.title}</div>
        <div className="mt-0.5 line-clamp-1 text-ink-2">{r.description}</div>
        {r.document_title && <div className="mt-0.5 truncate text-xs text-ink-3">{r.document_title}</div>}
      </td>
      <td className="px-3 py-3">
        <CategoryTag category={r.category} />
      </td>
      <td className="px-3 py-3">
        <LevelBadge level={r.priority} />
      </td>
      <td className="px-3 py-3">
        <LevelBadge level={r.risk} />
      </td>
      <td className="px-3 py-3">
        <AmbiguityMeter score={r.ambiguity_score} />
        {!r.testable && <div className="mt-1 text-xs text-redline">Not testable as written</div>}
      </td>
      <td className="px-3 py-3 text-right">
        {r.test_count ? (
          <span className="inline-flex items-center gap-1 font-medium tabular">
            {r.needs_review > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-[hsl(17_70%_48%)]" /> : <Check className="h-3.5 w-3.5 text-insert" />}
            {r.test_count}
          </span>
        ) : (
          <span className="text-xs text-redline">None</span>
        )}
      </td>
      <td className="px-3 py-3">
        <SourceBadge source={r.analysis_source} />
      </td>
    </tr>
  );
}

function AddRequirementDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: number) => void }) {
  const { projects, projectId: scopeId } = useScope();
  const [projectId, setProjectId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("");
  const [analyze, setAnalyze] = useState(true);
  const refresh = useRefreshAll();
  const { data: docs = [] } = useQuery({
    queryKey: ["documents", { project_id: Number(projectId) }],
    queryFn: () => api.documents({ project_id: Number(projectId) }),
    enabled: open && !!projectId,
  });

  useEffect(() => {
    if (open) {
      setProjectId(String(scopeId ?? projects[0]?.id ?? ""));
      setDocumentId("");
      setDescription("");
      setTitle("");
      setSection("");
      setAnalyze(true);
    }
  }, [open, scopeId, projects]);

  const create = useMutation({
    mutationFn: () =>
      api.createRequirement({
        project_id: Number(projectId),
        document_id: documentId ? Number(documentId) : null,
        description: description.trim(),
        title: title.trim() || undefined,
        section,
        analyze,
      }),
    onSuccess: (r) => {
      refresh();
      onOpenChange(false);
      toast.success(`${r.code} added`);
      onCreated(r.id);
    },
  });
  const tooShort = description.trim().length > 0 && description.trim().length < 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add requirement" description="Manually captured requirements get the next ID and can be analysed like extracted ones.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (projectId && description.trim().length >= 10) create.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project">
              <Select value={projectId} onChange={(v) => { setProjectId(v); setDocumentId(""); }} placeholder="Choose a project" options={projects.map((p) => ({ value: String(p.id), label: p.name }))} className="w-full" />
            </Field>
            <Field label="Document">
              <Select value={documentId} onChange={setDocumentId} allLabel="None" options={docs.map((d) => ({ value: String(d.id), label: d.title }))} className="w-full" />
            </Field>
          </div>
          <Field label="Requirement statement" error={tooShort ? "Write at least 10 characters." : null} hint="Write it as an obligation, e.g. “The system shall …”.">
            <Textarea value={description} maxLength={2000} autoFocus onChange={(e) => setDescription(e.target.value)} className="min-h-[100px]" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" hint="Generated when left empty.">
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Section">
              <Input value={section} maxLength={300} onChange={(e) => setSection(e.target.value)} placeholder="e.g. 4 Payments" />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 text-[13px] text-ink-2">
            <Switch checked={analyze} onCheckedChange={setAnalyze} /> Analyse category, priority, risk and acceptance criteria now
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!projectId || description.trim().length < 10} loading={create.isPending}>
              Add requirement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
