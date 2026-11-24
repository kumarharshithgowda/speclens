import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  FileStack,
  FileUp,
  FolderKanban,
  FolderPlus,
  GitCompareArrows,
  ListChecks,
  Network,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SeverityBadge } from "@/components/shared/badges";
import { ChangeSpectrum } from "@/components/shared/change";
import { CoverageRing, HBarChart, SegmentBar, TrendChart } from "@/components/shared/charts";
import { ProjectDialog, UploadDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, PageHeader, Panel, ProgressBar, Skeleton, StatTile } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { useScope } from "@/context/app";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { Activity, ChangeSet } from "@/lib/types";
import { cn, plural, PROJECT_COLORS, TEST_TYPE_LABEL, timeAgo } from "@/lib/utils";

const ACTIVITY_ICON: Record<string, typeof ActivityIcon> = {
  project_created: FolderPlus,
  project_updated: FolderKanban,
  document_uploaded: FileUp,
  version_uploaded: FileUp,
  document_processed: FileStack,
  requirements_extracted: ScrollText,
  version_compared: GitCompareArrows,
  tests_generated: Wand2,
  test_created: ListChecks,
  requirement_created: ScrollText,
  document_failed: ShieldAlert,
};

export default function Dashboard() {
  const { projectId, currentProject } = useScope();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.dashboard(projectId),
    refetchInterval: (q) => (q.state.data?.kpis.processing ? 2500 : false),
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={currentProject ? currentProject.name : "Overview"}
        description={
          currentProject
            ? "Requirements, coverage and change signals for this project."
            : "Requirements, coverage and change signals across every project."
        }
        actions={
          <>
            <Button onClick={() => setProjectOpen(true)}>
              <FolderPlus /> New project
            </Button>
            <Button variant="primary" onClick={() => setUploadOpen(true)}>
              <FileUp /> Upload document
            </Button>
          </>
        }
      />

      {error ? (
        <div className="panel">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : data.kpis.projects === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Sparkles />}
            title="Start with a project"
            description="Create a project, upload a specification PDF and SpecLens extracts and analyses every requirement."
            action={
              <Button variant="primary" onClick={() => setProjectOpen(true)}>
                <FolderPlus /> Create project
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Projects" value={data.kpis.projects} hint={`${data.recent_projects.filter((p) => p.status === "active").length} active`} icon={<FolderKanban />} />
            <StatTile label="Documents" value={data.kpis.documents} hint={plural(data.kpis.versions, "version")} icon={<FileStack />} />
            <StatTile
              label="Requirements"
              value={data.kpis.requirements}
              hint={data.kpis.ambiguous ? `${data.kpis.ambiguous} need clarification` : "All clearly worded"}
              tone={data.kpis.ambiguous ? "warn" : "good"}
              icon={<ScrollText />}
            />
            <StatTile
              label="Test cases"
              value={data.kpis.test_cases}
              hint={data.kpis.needs_review ? `${data.kpis.needs_review} need review after changes` : "None awaiting review"}
              tone={data.kpis.needs_review ? "warn" : "good"}
              icon={<ListChecks />}
            />
            <StatTile
              label="Requirement coverage"
              value={`${Math.round(data.kpis.coverage_pct)}%`}
              hint={data.kpis.uncovered ? `${plural(data.kpis.uncovered, "requirement")} without tests` : "Every requirement has tests"}
              tone={data.kpis.uncovered ? "warn" : "good"}
              icon={<Network />}
              className="col-span-2 md:col-span-1"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel title="Requirements and tests" description="Cumulative totals, last 14 days" className="xl:col-span-2" bodyClassName="p-4">
              <TrendChart data={data.trend} />
            </Panel>
            <Panel
              title="Coverage"
              description="Requirements with at least one active test"
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/traceability">Matrix</Link>
                </Button>
              }
              bodyClassName="p-5"
            >
              <div className="flex items-center gap-5">
                <CoverageRing value={data.kpis.coverage_pct} />
                <div className="min-w-0 flex-1 space-y-3 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Criteria verified</span>
                    <span className="font-semibold tabular">{Math.round(data.kpis.criteria_coverage_pct)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">High-risk requirements</span>
                    <span className="font-semibold tabular">{data.kpis.high_risk}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Tests needing review</span>
                    <span className="font-semibold tabular">{data.kpis.needs_review}</span>
                  </div>
                </div>
              </div>
              <SegmentBar
                className="mt-5"
                segments={[
                  { label: "Covered", value: data.coverage.covered, className: "bg-insert" },
                  { label: "Partial", value: data.coverage.partial, className: "bg-warning" },
                  { label: "Uncovered", value: data.coverage.uncovered, className: "bg-redline/70" },
                ]}
              />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <AlertsPanel alerts={data.alerts} />
            <Panel title="Requirements by category" bodyClassName="p-4">
              {data.by_category.length ? <HBarChart data={data.by_category} /> : <p className="py-8 text-center text-[13px] text-ink-3">No requirements yet.</p>}
            </Panel>
            <Panel title="Test mix" description="Active test cases by type" bodyClassName="p-4">
              {data.test_types.length ? (
                <HBarChart data={data.test_types.map((t) => ({ name: TEST_TYPE_LABEL[t.name] ?? t.name, value: t.value }))} color="var(--series-2)" />
              ) : (
                <p className="py-8 text-center text-[13px] text-ink-3">No test cases yet.</p>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <Panel
              title="Recent projects"
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/projects">All projects</Link>
                </Button>
              }
            >
              <ul className="divide-y">
                {data.recent_projects.map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="block px-4 py-3 hover:bg-surface-2">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PROJECT_COLORS[p.color] }} />
                        <span className="flex-1 truncate text-[13.5px] font-medium">{p.name}</span>
                        <span className="text-xs tabular text-ink-2">{Math.round(p.stats.coverage_pct)}% covered</span>
                      </div>
                      <ProgressBar value={p.stats.coverage_pct} className="mt-2" tone={p.stats.coverage_pct >= 80 ? "good" : "brand"} />
                      <div className="mt-1.5 text-xs text-ink-3">
                        {plural(p.stats.requirements, "requirement")}, {plural(p.stats.test_cases, "test")}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Recent activity">
              <ActivityFeed items={data.activity} />
            </Panel>
            <QuickActions onUpload={() => setUploadOpen(true)} onProject={() => setProjectOpen(true)} />
          </div>
        </div>
      )}
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ProjectDialog open={projectOpen} onOpenChange={setProjectOpen} />
    </>
  );
}

function AlertsPanel({ alerts }: { alerts: ChangeSet[] }) {
  const refresh = useRefreshAll();
  const ack = useMutation({
    mutationFn: (id: number) => api.acknowledge(id),
    onSuccess: () => {
      refresh();
      toast.success("Change alert acknowledged");
    },
  });
  return (
    <Panel title="Change alerts" description="New document versions awaiting review">
      {alerts.length === 0 ? (
        <EmptyState className="py-10" icon={<GitCompareArrows />} title="No open alerts" description="Upload a newer version of a document to see what changed." />
      ) : (
        <ul className="divide-y">
          {alerts.map((a) => {
            const top = (["critical", "high", "medium", "low"] as const).find((s) => (a.severity_counts[s] ?? 0) > 0);
            return (
              <li key={a.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/changes?set=${a.id}`} className="block truncate text-[13.5px] font-medium hover:text-brand-ink">
                      {a.document_title}
                    </Link>
                    <div className="mt-0.5 text-xs text-ink-3">
                      v{a.from_version} to v{a.to_version}, {timeAgo(a.created_at)}
                    </div>
                  </div>
                  {top && <SeverityBadge severity={top} />}
                </div>
                <div className="mt-3">
                  <ChangeSpectrum counts={a.counts} showLegend={false} includeUnchanged={false} height="h-2" />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <span className="text-ink-2">
                    <span className="text-insert">+{a.counts.added}</span> <span className="text-brand-ink">~{a.counts.modified}</span>{" "}
                    <span className="text-redline">−{a.counts.removed}</span>
                    <span className="ml-2 text-ink-3">{plural(a.affected_tests, "test")} affected</span>
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => ack.mutate(a.id)} disabled={ack.isPending}>
                      Acknowledge
                    </Button>
                    <Button asChild size="sm" variant="soft">
                      <Link to={`/changes?set=${a.id}`}>Review</Link>
                    </Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ActivityFeed({ items }: { items: Activity[] }) {
  const navigate = useNavigate();
  if (!items.length) return <p className="px-4 py-8 text-center text-[13px] text-ink-3">No activity yet.</p>;
  return (
    <ol className="max-h-[360px] overflow-y-auto scrollbar-thin px-4 py-2">
      {items.map((a, i) => {
        const Icon = ACTIVITY_ICON[a.kind] ?? ActivityIcon;
        return (
          <li key={a.id} className="relative flex gap-3 py-2">
            {i < items.length - 1 && <span className="absolute left-[13px] top-9 h-[calc(100%-24px)] w-px bg-line" />}
            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border bg-surface", a.kind === "document_failed" ? "text-redline" : "text-ink-3")}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <button
              disabled={!a.link}
              onClick={() => a.link && navigate(a.link)}
              className="min-w-0 flex-1 text-left disabled:cursor-default"
            >
              <span className="block text-[13px] leading-snug text-ink hover:underline">{a.message}</span>
              <span className="text-xs text-ink-3">{timeAgo(a.created_at)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function QuickActions({ onUpload, onProject }: { onUpload: () => void; onProject: () => void }) {
  const navigate = useNavigate();
  const actions = [
    { icon: FileUp, title: "Upload a specification", body: "Extract and analyse requirements from a PDF.", onClick: onUpload },
    { icon: Wand2, title: "Generate tests for gaps", body: "Open uncovered requirements and generate tests.", onClick: () => navigate("/requirements?coverage=uncovered") },
    { icon: GitCompareArrows, title: "Review version changes", body: "See what changed between document versions.", onClick: () => navigate("/changes") },
    { icon: FolderPlus, title: "Create a project", body: "Group specifications for one product.", onClick: onProject },
  ];
  return (
    <Panel title="Quick actions">
      <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-1">
        {actions.map((a) => (
          <button key={a.title} onClick={a.onClick} className="group flex items-start gap-3 bg-surface px-4 py-3.5 text-left hover:bg-surface-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-ink">
              <a.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">{a.title}</span>
              <span className="block text-xs text-ink-3">{a.body}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="panel space-y-4 p-4">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="panel h-[280px] p-4 xl:col-span-2">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="panel h-[280px] p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
