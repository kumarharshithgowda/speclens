import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, FolderKanban, FolderPlus, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/badges";
import { ConfirmDialog, ProjectDialog } from "@/components/shared/dialogs";
import { CardsSkeleton, EmptyState, ErrorState, PageHeader, ProgressBar } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { PROJECT_COLORS, timeAgo } from "@/lib/utils";

export default function Projects() {
  const { data: projects, isLoading, error, refetch } = useQuery({ queryKey: ["projects"], queryFn: () => api.projects() });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; project?: Project }>({ open: false });
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const refresh = useRefreshAll();

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    onSuccess: () => {
      refresh();
      toast.success("Project deleted");
      setToDelete(null);
    },
  });

  const filtered = useMemo(
    () =>
      (projects ?? []).filter(
        (p) => (!status || p.status === status) && (!q || `${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [projects, q, status],
  );

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project holds the specifications, requirements and test plan of one product."
        actions={
          <Button variant="primary" onClick={() => setDialog({ open: true })}>
            <FolderPlus /> New project
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="pl-9" aria-label="Search projects" />
        </div>
        <Select
          value={status}
          onChange={setStatus}
          allLabel="Any status"
          className="w-40"
          options={[
            { value: "active", label: "Active" },
            { value: "on_hold", label: "On hold" },
            { value: "completed", label: "Completed" },
            { value: "archived", label: "Archived" },
          ]}
        />
        {projects && <span className="ml-auto text-xs text-ink-3">{filtered.length} of {projects.length}</span>}
      </div>

      {error ? (
        <div className="panel">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <CardsSkeleton count={3} />
      ) : filtered.length === 0 ? (
        <div className="panel">
          {projects?.length ? (
            <EmptyState icon={<Search />} title="No projects match" description="Clear the search or status filter to see all projects." action={<Button onClick={() => { setQ(""); setStatus(""); }}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={<FolderKanban />}
              title="No projects yet"
              description="Create your first project, then upload a specification to extract its requirements."
              action={
                <Button variant="primary" onClick={() => setDialog({ open: true })}>
                  <FolderPlus /> Create project
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <article key={p.id} className="panel group relative flex flex-col overflow-hidden transition-colors hover:border-ink-3/40">
              <div className="h-1" style={{ background: PROJECT_COLORS[p.color] }} />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/projects/${p.id}`} className="min-w-0 after:absolute after:inset-0">
                    <h2 className="truncate text-[15px] font-semibold text-ink">{p.name}</h2>
                  </Link>
                  <div className="relative z-10 flex items-center gap-1">
                    <StatusBadge status={p.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded-md p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={`Actions for ${p.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, project: p })}>
                          <Pencil /> Edit project
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem danger onSelect={() => setToDelete(p)}>
                          <Trash2 /> Delete project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-[40px] text-[13px] leading-relaxed text-ink-2">{p.description || "No description."}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-y py-3">
                  {[
                    ["Documents", p.stats.documents],
                    ["Requirements", p.stats.requirements],
                    ["Tests", p.stats.test_cases],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-ink-3">{label}</dt>
                      <dd className="mt-0.5 text-[17px] font-semibold tabular">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-ink-2">Requirement coverage</span>
                    <span className="font-semibold tabular">{Math.round(p.stats.coverage_pct)}%</span>
                  </div>
                  <ProgressBar value={p.stats.coverage_pct} tone={p.stats.coverage_pct >= 80 ? "good" : "brand"} />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
                  <span>Updated {timeAgo(p.updated_at)}</span>
                  {(p.stats.open_alerts > 0 || p.stats.needs_review > 0) && (
                    <span className="inline-flex items-center gap-1 text-[hsl(17_70%_42%)] dark:text-serious">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {p.stats.open_alerts > 0 ? `${p.stats.open_alerts} change alert` : `${p.stats.needs_review} tests to review`}
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ProjectDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} project={dialog.project} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? "project"}?`}
        description={
          <>
            This permanently deletes the project with its {toDelete?.stats.documents} documents, {toDelete?.stats.requirements} requirements and{" "}
            {toDelete?.stats.test_cases} test cases. Uploaded files are removed too.
          </>
        }
        confirmLabel="Delete project"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}
