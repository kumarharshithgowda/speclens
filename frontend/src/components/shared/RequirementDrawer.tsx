import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, FileText, Lightbulb, ListChecks, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AmbiguityMeter,
  CategoryTag,
  LevelBadge,
  SourceBadge,
  StatusBadge,
  TestTypeTag,
} from "@/components/shared/badges";
import { ConfirmDialog, GenerateDialog } from "@/components/shared/dialogs";
import { ErrorState, Skeleton } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, Textarea } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, SheetContent } from "@/components/ui/overlay";
import { Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { Requirement } from "@/lib/types";
import { CATEGORIES, cn, LEVELS, timeAgo } from "@/lib/utils";

export function RequirementDrawer({ requirementId, onClose }: { requirementId: number | null; onClose: () => void }) {
  const open = requirementId !== null;
  const { data: req, isLoading, error, refetch } = useQuery({
    queryKey: ["requirement", requirementId],
    queryFn: () => api.requirement(requirementId!),
    enabled: open,
  });
  const [tab, setTab] = useState("overview");
  const [genOpen, setGenOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = useRefreshAll();

  useEffect(() => {
    if (open) setTab("overview");
  }, [requirementId, open]);

  const reanalyze = useMutation({
    mutationFn: () => api.reanalyze(requirementId!),
    onSuccess: (r) => {
      refresh();
      toast.success(`${r.code} re-analysed`, { description: r.analysis_source === "ai" ? "Analysis by AI model." : "Analysis by demo engine." });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteRequirement(requirementId!),
    onSuccess: () => {
      refresh();
      toast.success("Requirement deleted");
      setConfirmDelete(false);
      onClose();
    },
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={
          req ? (
            <span className="flex items-center gap-2">
              <span className="code-id text-[13px]">{req.code}</span>
              <span className="truncate">{req.title}</span>
            </span>
          ) : (
            "Requirement"
          )
        }
        description={
          req ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {req.document_title && (
                <Link to={`/documents/${req.document_id}`} onClick={onClose} className="inline-flex items-center gap-1 hover:text-ink">
                  <FileText className="h-3.5 w-3.5" />
                  {req.document_title}
                </Link>
              )}
              {req.section && <span className="truncate">{req.section}</span>}
              {req.page && <span>Page {req.page}</span>}
            </span>
          ) : undefined
        }
        headerExtra={
          req && (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-md p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => reanalyze.mutate()}>
                  <RefreshCw /> Re-analyse
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setGenOpen(true)} disabled={req.status !== "active"}>
                  <Wand2 /> Generate tests
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete requirement
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      >
        {isLoading && (
          <div className="space-y-4 p-6">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {req && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="sticky top-0 z-10 bg-surface px-4">
              <TabsTrigger value="overview">Intelligence</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="tests" count={req.test_count}>
                Tests
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="p-6 outline-none">
              <Overview req={req} reanalyzing={reanalyze.isPending} onReanalyze={() => reanalyze.mutate()} />
            </TabsContent>
            <TabsContent value="edit" className="p-6 outline-none">
              <EditForm req={req} onSaved={() => setTab("overview")} />
            </TabsContent>
            <TabsContent value="tests" className="p-6 outline-none">
              <LinkedTests req={req} onGenerate={() => setGenOpen(true)} onNavigate={onClose} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
      {req && <GenerateDialog open={genOpen} onOpenChange={setGenOpen} requirementIds={[req.id]} onDone={() => setTab("tests")} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${req?.code ?? "requirement"}?`}
        description="The requirement, its acceptance criteria and all linked test cases are permanently deleted."
        confirmLabel="Delete requirement"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </DialogPrimitive.Root>
  );
}

function Attr({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-ink-3">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Overview({ req, reanalyzing, onReanalyze }: { req: Requirement; reanalyzing: boolean; onReanalyze: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={req.analysis_source} />
        <StatusBadge status={req.status === "removed" ? "obsolete" : req.review_status} />
        {req.external_id && <span className="rounded border px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{req.external_id}</span>}
        {req.edited && <span className="text-xs text-ink-3">Edited manually</span>}
        <span className="ml-auto text-xs text-ink-3">
          Introduced in v{req.introduced_version}
          {req.last_changed_version > req.introduced_version && `, changed in v${req.last_changed_version}`}
        </span>
      </div>

      <blockquote className="rounded-md border-l-[3px] border-brand bg-surface-2 px-4 py-3 text-[14px] leading-relaxed text-ink">{req.description}</blockquote>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Attr label="Category">
          <CategoryTag category={req.category} />
        </Attr>
        <Attr label="Priority">
          <LevelBadge level={req.priority} />
        </Attr>
        <Attr label="Risk">
          <LevelBadge level={req.risk} />
        </Attr>
        <Attr label="Complexity">
          <span className="text-[13px] text-ink">{req.complexity}</span>
        </Attr>
        <Attr label="Testable">
          <span className={cn("inline-flex items-center gap-1 text-[13px]", req.testable ? "text-insert" : "text-redline")}>
            {req.testable ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {req.testable ? "Yes" : "Not as written"}
          </span>
        </Attr>
        <Attr label="Ambiguity">
          <AmbiguityMeter score={req.ambiguity_score} />
        </Attr>
      </div>

      {(req.ambiguity_notes || req.clarification) && (
        <div className="rounded-md border border-warning/50 bg-warning/[0.07] p-4">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 text-[hsl(38_90%_40%)]" /> Potential ambiguity
          </div>
          {req.ambiguity_notes && <p className="text-[13px] text-ink-2">{req.ambiguity_notes}</p>}
          {req.clarification && (
            <p className="mt-2.5 flex gap-2 text-[13px] text-ink">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span>
                <span className="font-medium">Suggested clarification: </span>
                {req.clarification}
              </span>
            </p>
          )}
        </div>
      )}

      <CriteriaEditor req={req} />

      {req.rationale && (
        <p className="text-xs leading-relaxed text-ink-3">
          <span className="font-medium text-ink-2">Why this classification: </span>
          {req.rationale}
        </p>
      )}
      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-xs text-ink-3">Updated {timeAgo(req.updated_at)}</span>
        <Button size="sm" variant="secondary" onClick={onReanalyze} loading={reanalyzing}>
          {!reanalyzing && <RefreshCw />} Re-analyse
        </Button>
      </div>
    </div>
  );
}

function CriteriaEditor({ req }: { req: Requirement }) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const refresh = useRefreshAll();
  useEffect(() => {
    setItems(req.criteria.map((c) => c.text));
    setEditing(false);
  }, [req.id, req.criteria]);

  const save = useMutation({
    mutationFn: () => api.setCriteria(req.id, items),
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast.success("Acceptance criteria saved");
    },
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold">Acceptance criteria</h3>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </div>
      {!editing ? (
        req.criteria.length ? (
          <ol className="space-y-2">
            {req.criteria.map((c) => (
              <li key={c.id} className="flex gap-3 rounded-md border px-3 py-2.5">
                <span className="code-id shrink-0 pt-px text-[11.5px]">{c.code}</span>
                <span className="text-[13px] leading-relaxed text-ink">{c.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-[13px] text-ink-3">No acceptance criteria yet.</p>
        )
      ) : (
        <div className="space-y-2">
          {items.map((text, i) => (
            <div key={i} className="flex gap-2">
              <Textarea
                value={text}
                className="min-h-[64px] text-[13px]"
                aria-label={`Criterion ${i + 1}`}
                onChange={(e) => setItems((cur) => cur.map((t, j) => (j === i ? e.target.value : t)))}
              />
              <Button variant="ghost" size="icon" onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove criterion">
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button size="sm" variant="ghost" onClick={() => setItems((cur) => [...cur, "Given …, when …, then …"])} disabled={items.length >= 12}>
              <Plus /> Add criterion
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setItems(req.criteria.map((c) => c.text)); setEditing(false); }}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                Save criteria
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditForm({ req, onSaved }: { req: Requirement; onSaved: () => void }) {
  const [form, setForm] = useState(() => pick(req));
  const refresh = useRefreshAll();
  useEffect(() => setForm(pick(req)), [req]);
  const set = <K extends keyof ReturnType<typeof pick>>(k: K, v: ReturnType<typeof pick>[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => api.updateRequirement(req.id, form),
    onSuccess: () => {
      refresh();
      toast.success(`${req.code} saved`);
      onSaved();
    },
  });
  const descError = form.description.trim().length < 10 ? "Description must be at least 10 characters." : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!descError && form.title.trim().length >= 2) save.mutate();
      }}
    >
      <Field label="Title">
        <Input value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Requirement statement" error={descError}>
        <Textarea value={form.description} maxLength={2000} className="min-h-[110px]" onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select value={form.category} onChange={(v) => set("category", v)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} className="w-full" />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(v) => set("priority", v as Requirement["priority"])} options={LEVELS.map((c) => ({ value: c, label: c }))} className="w-full" />
        </Field>
        <Field label="Risk">
          <Select value={form.risk} onChange={(v) => set("risk", v as Requirement["risk"])} options={LEVELS.map((c) => ({ value: c, label: c }))} className="w-full" />
        </Field>
        <Field label="Complexity">
          <Select
            value={form.complexity}
            onChange={(v) => set("complexity", v as Requirement["complexity"])}
            options={["Low", "Medium", "High"].map((c) => ({ value: c, label: c }))}
            className="w-full"
          />
        </Field>
        <Field label="Review status">
          <Select
            value={form.review_status}
            onChange={(v) => set("review_status", v as Requirement["review_status"])}
            options={[
              { value: "draft", label: "Draft" },
              { value: "reviewed", label: "Reviewed" },
              { value: "approved", label: "Approved" },
            ]}
            className="w-full"
          />
        </Field>
        <div className="space-y-1.5">
          <div className="text-[13px] font-medium">Testable</div>
          <label className="flex h-9 items-center gap-2.5 text-[13px] text-ink-2">
            <Switch checked={form.testable} onCheckedChange={(v) => set("testable", v)} />
            {form.testable ? "Objectively testable" : "Needs clarification"}
          </label>
        </div>
      </div>
      <Field label="Suggested clarification">
        <Textarea value={form.clarification} maxLength={2000} onChange={(e) => set("clarification", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={() => setForm(pick(req))}>
          Reset
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function pick(r: Requirement) {
  return {
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    risk: r.risk,
    complexity: r.complexity,
    testable: r.testable,
    review_status: r.review_status,
    clarification: r.clarification,
  };
}

function LinkedTests({ req, onGenerate, onNavigate }: { req: Requirement; onGenerate: () => void; onNavigate: () => void }) {
  const { data: tests, isLoading } = useQuery({
    queryKey: ["test-cases", { requirement_id: req.id }],
    queryFn: () => api.testCases({ requirement_id: req.id }),
  });
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-2">
          {req.criteria.length} acceptance criteria, {tests?.length ?? 0} linked test cases
        </p>
        <Button size="sm" variant="primary" onClick={onGenerate} disabled={req.status !== "active"}>
          <Wand2 /> Generate tests
        </Button>
      </div>
      {tests && tests.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {tests.map((t) => (
            <li key={t.id}>
              <Link to={`/test-cases?focus=${t.id}`} onClick={onNavigate} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
                <span className="code-id w-[68px] shrink-0">{t.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                <TestTypeTag type={t.test_type} />
                <StatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-8 text-center">
          <ListChecks className="mx-auto mb-2 h-5 w-5 text-ink-3" />
          <p className="text-[13px] text-ink-2">No tests cover this requirement yet.</p>
        </div>
      )}
    </div>
  );
}
