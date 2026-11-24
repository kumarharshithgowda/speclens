import { useMutation, useQuery } from "@tanstack/react-query";
import { FileStack, FileUp, GitCompareArrows, MoreHorizontal, Pencil, ScrollText, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SeverityBadge, StatusBadge } from "@/components/shared/badges";
import { ChangeSpectrum } from "@/components/shared/change";
import { CoverageRing, HBarChart } from "@/components/shared/charts";
import { ConfirmDialog, ProjectDialog, UploadDialog } from "@/components/shared/dialogs";
import { DocumentStatus } from "@/components/shared/DocumentStatus";
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton, StatTile } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { useCrumb, useScope } from "@/context/app";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import { plural, PROJECT_COLORS, timeAgo } from "@/lib/utils";

export default function ProjectDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { setProjectId } = useScope();
  const refresh = useRefreshAll();
  const project = useQuery({ queryKey: ["project", id], queryFn: () => api.project(id) });
  const docs = useQuery({
    queryKey: ["documents", { project_id: id }],
    queryFn: () => api.documents({ project_id: id }),
    refetchInterval: (q) => (q.state.data?.some((d) => d.latest_version && ["queued", "processing"].includes(d.latest_version.status)) ? 2000 : false),
  });
  const dash = useQuery({ queryKey: ["dashboard", id], queryFn: () => api.dashboard(id) });
  const changes = useQuery({ queryKey: ["changes", { projectId: id }], queryFn: () => api.changeSets({ project_id: id }) });
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useCrumb(project.data?.name);

  const remove = useMutation({
    mutationFn: () => api.deleteProject(id),
    onSuccess: () => {
      refresh();
      toast.success("Project deleted");
      navigate("/projects");
    },
  });

  if (project.error)
    return (
      <div className="panel">
        <ErrorState error={project.error} onRetry={() => project.refetch()} />
      </div>
    );
  const p = project.data;
  const k = dash.data?.kpis;

  return (
    <>
      <PageHeader
        title={
          p ? (
            <span className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ background: PROJECT_COLORS[p.color] }} />
              {p.name}
              <StatusBadge status={p.status} />
            </span>
          ) : (
            <Skeleton className="h-6 w-64" />
          )
        }
        description={p?.description || undefined}
        actions={
          <>
            <Button
              onClick={() => {
                setProjectId(id);
                navigate("/requirements");
              }}
            >
              <ScrollText /> Requirements
            </Button>
            <Button variant="primary" onClick={() => setUploadOpen(true)}>
              <FileUp /> Upload document
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" aria-label="Project actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil /> Edit project
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setProjectId(id);
                    navigate("/requirements?coverage=uncovered");
                  }}
                >
                  <Wand2 /> Generate tests for gaps
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => setConfirm(true)}>
                  <Trash2 /> Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Documents" value={k?.documents ?? "–"} hint={k ? plural(k.versions, "version") : undefined} />
        <StatTile label="Requirements" value={k?.requirements ?? "–"} hint={k ? `${k.high_risk} high risk, ${k.ambiguous} ambiguous` : undefined} />
        <StatTile label="Test cases" value={k?.test_cases ?? "–"} hint={k?.needs_review ? `${k.needs_review} need review` : "None awaiting review"} tone={k?.needs_review ? "warn" : undefined} />
        <StatTile label="Uncovered requirements" value={k?.uncovered ?? "–"} hint="Have no active test" tone={k?.uncovered ? "warn" : "good"} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel
          title="Documents"
          description="Specifications in this project"
          className="xl:col-span-2"
          actions={
            <Button size="sm" variant="ghost" onClick={() => setUploadOpen(true)}>
              <FileUp /> Upload
            </Button>
          }
        >
          {docs.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : docs.data?.length ? (
            <ul className="divide-y">
              {docs.data.map((d) => (
                <li key={d.id}>
                  <Link to={`/documents/${d.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-surface-2 text-ink-3">
                      <FileStack className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{d.title}</span>
                      <span className="text-xs text-ink-3">
                        {d.doc_type}, {plural(d.version_count, "version")}, updated {timeAgo(d.updated_at)}
                      </span>
                    </span>
                    <span className="hidden text-right text-xs text-ink-2 sm:block">
                      <span className="block text-[15px] font-semibold tabular text-ink">{d.requirement_count}</span>
                      requirements
                    </span>
                    {d.latest_version && <DocumentStatus version={d.latest_version} compact />}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FileStack />}
              title="No documents yet"
              description="Upload a specification PDF to extract its requirements."
              action={
                <Button variant="primary" onClick={() => setUploadOpen(true)}>
                  <FileUp /> Upload document
                </Button>
              }
            />
          )}
        </Panel>
        <Panel title="Coverage" bodyClassName="flex flex-col items-center gap-4 p-5">
          <CoverageRing value={k?.coverage_pct ?? 0} />
          <p className="text-center text-[13px] text-ink-2">
            {k ? `${k.requirements - k.uncovered} of ${k.requirements} requirements have at least one test.` : ""}
          </p>
          <Button asChild variant="soft" size="sm">
            <Link to="/traceability" onClick={() => setProjectId(id)}>
              Open traceability matrix
            </Link>
          </Button>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Risk profile" description="Requirements by risk level" bodyClassName="p-4">
          {dash.data ? <HBarChart data={dash.data.by_risk.filter((r) => r.value > 0)} color="var(--series-2)" /> : <Skeleton className="h-32 w-full" />}
        </Panel>
        <Panel title="Categories" bodyClassName="p-4">
          {dash.data ? <HBarChart data={dash.data.by_category} /> : <Skeleton className="h-32 w-full" />}
        </Panel>
        <Panel title="Version changes" description="Comparisons between document versions">
          {changes.data?.length ? (
            <ul className="divide-y">
              {changes.data.slice(0, 4).map((c) => {
                const top = (["critical", "high", "medium", "low"] as const).find((s) => (c.severity_counts[s] ?? 0) > 0);
                return (
                  <li key={c.id}>
                    <Link to={`/changes?set=${c.id}`} className="block px-4 py-3 hover:bg-surface-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">{c.document_title}</span>
                        {top && <SeverityBadge severity={top} />}
                      </div>
                      <div className="mb-2 mt-0.5 text-xs text-ink-3">
                        v{c.from_version} to v{c.to_version}, {timeAgo(c.created_at)}
                      </div>
                      <ChangeSpectrum counts={c.counts} showLegend={false} includeUnchanged={false} height="h-1.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState className="py-8" icon={<GitCompareArrows />} title="No version changes" description="Upload a newer version of a document to compare." />
          )}
        </Panel>
      </div>

      {p && <ProjectDialog open={editOpen} onOpenChange={setEditOpen} project={p} />}
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultProjectId={id} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${p?.name ?? "project"}?`}
        description="All documents, requirements, test cases and change history in this project are permanently deleted."
        confirmLabel="Delete project"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
