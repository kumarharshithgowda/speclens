import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, FileText, ListChecks, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { LevelBadge, SourceBadge, StatusBadge, TestTypeTag } from "@/components/shared/badges";
import { ConfirmDialog, GenerateDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/shared/feedback";
import { RequirementDrawer } from "@/components/shared/RequirementDrawer";
import { compareBy, Pagination, SelectionBar, SortHeader, type SortState } from "@/components/shared/table";
import { TestCaseDialog } from "@/components/shared/TestCaseDialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, SheetContent } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { useScope } from "@/context/app";
import { api } from "@/lib/api";
import { useDebounced, usePagination, useRefreshAll } from "@/lib/hooks";
import type { TestCase } from "@/lib/types";
import { cn, downloadUrl, LEVELS, TEST_TYPE_LABEL, TEST_TYPES, timeAgo } from "@/lib/utils";

type SortKey = "code" | "title" | "requirement_code" | "priority" | "test_type" | "status";

export default function TestCases() {
  const { projectId, currentProject } = useScope();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<number | null>(params.get("focus") ? Number(params.get("focus")) : null);
  const [edit, setEdit] = useState<{ open: boolean; test?: TestCase | null }>({ open: false });
  const [toDelete, setToDelete] = useState<number[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [genIds, setGenIds] = useState<number[]>([]);
  const [reqDrawer, setReqDrawer] = useState<number | null>(null);
  const refresh = useRefreshAll();

  useEffect(() => {
    const f = params.get("focus");
    if (f) setDetail(Number(f));
  }, [params]);

  const filters = { project_id: projectId, q: query, test_type: type, priority, status_filter: status, source };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["test-cases", filters],
    queryFn: () => api.testCases(filters),
    placeholderData: (p) => p,
  });
  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    if (sort) list.sort((a, b) => compareBy(a, b, sort.key) * (sort.dir === "asc" ? 1 : -1));
    return list;
  }, [data, sort]);
  const pager = usePagination(rows, 25);
  const detailTest = data?.find((t) => t.id === detail) ?? null;

  const remove = useMutation({
    mutationFn: (ids: number[]) => (ids.length === 1 ? api.deleteTest(ids[0]).then(() => ({ deleted: 1 })) : api.bulkDeleteTests(ids)),
    onSuccess: (res) => {
      refresh();
      toast.success(`Deleted ${res.deleted} test case${res.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
      setToDelete(null);
      setDetail(null);
    },
  });
  const markReady = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => api.updateTest(id, { status: "ready" }))),
    onSuccess: (res) => {
      refresh();
      toast.success(`${res.length} test case${res.length === 1 ? "" : "s"} marked ready`);
      setSelected(new Set());
    },
  });

  const pageIds = pager.slice.map((t) => t.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const activeFilters = [type, priority, status, source, query].filter(Boolean).length;
  const clear = () => {
    setQ("");
    setType("");
    setPriority("");
    setStatus("");
    setSource("");
    if (params.get("status")) setParams({});
  };
  const closeDetail = () => {
    setDetail(null);
    if (params.get("focus")) {
      params.delete("focus");
      setParams(params, { replace: true });
    }
  };
  const reportParams = { project_id: projectId };

  return (
    <>
      <PageHeader
        title="Test Cases"
        description={currentProject ? `Test plan for ${currentProject.name}.` : "Generated and manual test cases, each traced to a requirement and acceptance criterion."}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => downloadUrl(api.reportUrl("test-cases", "csv", reportParams))}>
                  <FileText /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadUrl(api.reportUrl("test-cases", "xlsx", reportParams))}>
                  <FileSpreadsheet /> Excel workbook
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadUrl(api.reportUrl("test-cases", "pdf", reportParams))}>
                  <FileText /> PDF report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setEdit({ open: true, test: null })}>
              <Plus /> New test case
            </Button>
            <Button variant="primary" onClick={() => setPickerOpen(true)}>
              <Wand2 /> Generate tests
            </Button>
          </>
        }
      />

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by test ID, title or requirement" className="h-8 pl-9" aria-label="Search test cases" />
          </div>
          <Select size="sm" className="w-32" value={type} onChange={setType} allLabel="All types" options={TEST_TYPES.map((t) => ({ value: t, label: TEST_TYPE_LABEL[t] }))} aria-label="Type" />
          <Select size="sm" className="w-32" value={priority} onChange={setPriority} allLabel="Any priority" options={LEVELS.map((l) => ({ value: l, label: l }))} aria-label="Priority" />
          <Select
            size="sm"
            className="w-36"
            value={status}
            onChange={setStatus}
            allLabel="Any status"
            options={[
              { value: "draft", label: "Draft" },
              { value: "ready", label: "Ready" },
              { value: "needs_review", label: "Needs review" },
              { value: "obsolete", label: "Obsolete" },
            ]}
            aria-label="Status"
          />
          <Select
            size="sm"
            className="w-32"
            value={source}
            onChange={setSource}
            allLabel="Any source"
            options={[
              { value: "ai", label: "AI" },
              { value: "demo", label: "Demo" },
              { value: "manual", label: "Manual" },
            ]}
            aria-label="Source"
          />
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" onClick={clear}>
              <X /> Clear filters
            </Button>
          )}
          <span className="ml-auto text-xs text-ink-3">{rows.length} test cases</span>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          activeFilters ? (
            <EmptyState icon={<Search />} title="No test cases match these filters" action={<Button onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={<ListChecks />}
              title="No test cases yet"
              description="Pick requirements and SpecLens drafts positive, negative and edge-case tests linked to their acceptance criteria."
              action={
                <Button variant="primary" onClick={() => setPickerOpen(true)}>
                  <Wand2 /> Generate tests
                </Button>
              }
            />
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
                        indeterminate={!allOnPage && pageIds.some((id) => selected.has(id))}
                        onCheckedChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            pageIds.forEach((id) => (allOnPage ? n.delete(id) : n.add(id)));
                            return n;
                          })
                        }
                      />
                    </th>
                    <SortHeader label="ID" k="code" sort={sort} onSort={setSort} className="w-24 pl-0" />
                    <SortHeader label="Test case" k="title" sort={sort} onSort={setSort} />
                    <SortHeader label="Requirement" k="requirement_code" sort={sort} onSort={setSort} />
                    <SortHeader label="Type" k="test_type" sort={sort} onSort={setSort} />
                    <SortHeader label="Priority" k="priority" sort={sort} onSort={setSort} />
                    <SortHeader label="Status" k="status" sort={sort} onSort={setSort} />
                    <th className="px-3 py-2.5 font-medium">Source</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pager.slice.map((t) => (
                    <tr key={t.id} className={cn("group cursor-pointer", selected.has(t.id) ? "bg-brand-soft/50" : "hover:bg-surface-2")} onClick={() => setDetail(t.id)}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(t.id)}
                          aria-label={`Select ${t.code}`}
                          onCheckedChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(t.id)) n.delete(t.id);
                              else n.add(t.id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <span className="code-id">{t.code}</span>
                      </td>
                      <td className="max-w-[420px] px-3 py-3">
                        <div className="truncate font-medium group-hover:text-brand-ink">{t.title}</div>
                        <div className="truncate text-ink-3">{t.scenario}</div>
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <button className="code-id hover:underline" onClick={() => setReqDrawer(t.requirement_id)}>
                          {t.requirement_code}
                        </button>
                        {t.criterion_code && <div className="font-mono text-[11px] text-ink-3">{t.criterion_code}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <TestTypeTag type={t.test_type} />
                      </td>
                      <td className="px-3 py-3">
                        <LevelBadge level={t.priority} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-3 py-3">
                        <SourceBadge source={t.source} />
                      </td>
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <RowMenu test={t} onEdit={() => setEdit({ open: true, test: t })} onDelete={() => setToDelete([t.id])} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pager} />
          </>
        )}
      </div>

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="ghost" className="text-surface hover:bg-surface/10 hover:text-surface" onClick={() => markReady.mutate([...selected])} loading={markReady.isPending}>
          <CheckCircle2 /> Mark ready
        </Button>
        <Button size="sm" variant="danger" onClick={() => setToDelete([...selected])}>
          <Trash2 /> Delete
        </Button>
      </SelectionBar>

      <TestDetailSheet test={detailTest} open={detail !== null} onClose={closeDetail} onEdit={(t) => setEdit({ open: true, test: t })} onDelete={(t) => setToDelete([t.id])} onOpenRequirement={setReqDrawer} />
      <TestCaseDialog open={edit.open} onOpenChange={(o) => setEdit((e) => ({ ...e, open: o }))} test={edit.test} projectId={projectId} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} test cases?` : "Delete this test case?"}
        description="Deleted test cases are removed from the traceability matrix. This cannot be undone."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
      <RequirementPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onContinue={(ids) => {
          setPickerOpen(false);
          setGenIds(ids);
        }}
      />
      <GenerateDialog open={genIds.length > 0} onOpenChange={(o) => !o && setGenIds([])} requirementIds={genIds} />
      <RequirementDrawer requirementId={reqDrawer} onClose={() => setReqDrawer(null)} />
    </>
  );
}

function RowMenu({ test, onEdit, onDelete }: { test: TestCase; onEdit: () => void; onDelete: () => void }) {
  const refresh = useRefreshAll();
  const regen = useMutation({
    mutationFn: () => api.regenerateTest(test.id),
    onSuccess: (t) => {
      refresh();
      toast.success(`${t.code} regenerated`, { description: t.source === "ai" ? "By the AI model." : "By the demo engine." });
    },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-md p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={`Actions for ${test.code}`}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => regen.mutate()}>
          <RefreshCw /> Regenerate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TestDetailSheet({
  test,
  open,
  onClose,
  onEdit,
  onDelete,
  onOpenRequirement,
}: {
  test: TestCase | null;
  open: boolean;
  onClose: () => void;
  onEdit: (t: TestCase) => void;
  onDelete: (t: TestCase) => void;
  onOpenRequirement: (id: number) => void;
}) {
  const refresh = useRefreshAll();
  const regen = useMutation({
    mutationFn: () => api.regenerateTest(test!.id),
    onSuccess: (t) => {
      refresh();
      toast.success(`${t.code} regenerated`);
    },
  });
  const setStatus = useMutation({
    mutationFn: (status: TestCase["status"]) => api.updateTest(test!.id, { status }),
    onSuccess: () => refresh(),
  });
  return (
    <DialogPrimitive.Root open={open && !!test} onOpenChange={(o) => !o && onClose()}>
      {test && (
        <SheetContent
          title={
            <span className="flex items-center gap-2">
              <span className="code-id text-[13px]">{test.code}</span>
              <span className="truncate">{test.title}</span>
            </span>
          }
          description={
            <span>
              Verifies{" "}
              <button className="code-id hover:underline" onClick={() => onOpenRequirement(test.requirement_id)}>
                {test.requirement_code}
              </button>{" "}
              {test.requirement_title}
              {test.criterion_code && <span className="text-ink-3"> through {test.criterion_code}</span>}
            </span>
          }
        >
          <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <TestTypeTag type={test.test_type} />
              <LevelBadge level={test.priority} />
              <StatusBadge status={test.status} />
              <SourceBadge source={test.source} />
              <span className="ml-auto text-xs text-ink-3">Updated {timeAgo(test.updated_at)}</span>
            </div>
            {test.scenario && <p className="text-[14px] leading-relaxed text-ink">{test.scenario}</p>}
            <div>
              <h3 className="mb-2 text-[13px] font-semibold">Preconditions</h3>
              <ul className="space-y-1.5">
                {test.preconditions.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-ink-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-[13px] font-semibold">Steps</h3>
              <ol className="space-y-2">
                {test.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[13px]">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/5 text-[11px] font-semibold tabular text-ink-2">{i + 1}</span>
                    <span className="pt-px leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-md border border-insert/25 bg-insert-soft/60 p-3.5">
              <h3 className="mb-1 text-[13px] font-semibold text-insert">Expected result</h3>
              <p className="text-[13px] leading-relaxed text-ink">{test.expected_result}</p>
            </div>
            {test.test_data && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold">Test data</h3>
                <p className="rounded-md border bg-surface-2 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-2">{test.test_data}</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {test.status !== "ready" && (
                <Button size="sm" variant="soft" onClick={() => setStatus.mutate("ready")} loading={setStatus.isPending}>
                  <CheckCircle2 /> Mark ready
                </Button>
              )}
              <Button size="sm" onClick={() => onEdit(test)}>
                <Pencil /> Edit
              </Button>
              <Button size="sm" onClick={() => regen.mutate()} loading={regen.isPending}>
                {!regen.isPending && <RefreshCw />} Regenerate
              </Button>
              <Button size="sm" variant="danger-ghost" className="ml-auto" onClick={() => onDelete(test)}>
                <Trash2 /> Delete
              </Button>
            </div>
          </div>
        </SheetContent>
      )}
    </DialogPrimitive.Root>
  );
}

function RequirementPicker({ open, onOpenChange, onContinue }: { open: boolean; onOpenChange: (o: boolean) => void; onContinue: (ids: number[]) => void }) {
  const { projectId } = useScope();
  const [q, setQ] = useState("");
  const [onlyUncovered, setOnlyUncovered] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const { data = [], isLoading } = useQuery({
    queryKey: ["requirements", { projectId, picker: "gen" }],
    queryFn: () => api.requirements({ project_id: projectId }),
    enabled: open,
  });
  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open]);
  const list = data.filter((r) => (!onlyUncovered || r.test_count === 0) && (!q || `${r.code} ${r.title} ${r.description}`.toLowerCase().includes(q.toLowerCase())));
  const all = list.length > 0 && list.every((r) => picked.has(r.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Choose requirements" description="Select the requirements to generate test cases for.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter requirements" className="h-8 pl-9" aria-label="Filter requirements" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <Checkbox checked={onlyUncovered} onCheckedChange={(v) => setOnlyUncovered(v === true)} /> Only without tests
          </label>
        </div>
        <div className="max-h-[46vh] overflow-y-auto rounded-md border scrollbar-thin">
          {isLoading ? (
            <TableSkeleton rows={5} cols={3} />
          ) : list.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink-3">{onlyUncovered ? "Every requirement already has tests." : "No requirements found."}</p>
          ) : (
            <>
              <label className="sticky top-0 flex items-center gap-3 border-b bg-surface-2 px-3 py-2 text-xs text-ink-3">
                <Checkbox checked={all} onCheckedChange={() => setPicked(all ? new Set() : new Set(list.map((r) => r.id)))} aria-label="Select all" />
                Select all {list.length}
              </label>
              <ul className="divide-y">
                {list.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
                      <Checkbox
                        className="mt-0.5"
                        checked={picked.has(r.id)}
                        onCheckedChange={() =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (n.has(r.id)) n.delete(r.id);
                            else n.add(r.id);
                            return n;
                          })
                        }
                      />
                      <span className="code-id w-16 shrink-0 pt-px">{r.code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{r.title}</span>
                        <span className="block truncate text-xs text-ink-3">{r.description}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular text-ink-3">{r.test_count} tests</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <DialogFooter>
          <span className="mr-auto text-[13px] text-ink-2">{picked.size} selected</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={picked.size === 0} onClick={() => onContinue([...picked])}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
