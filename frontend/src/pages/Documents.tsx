import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileStack, FileUp, GitBranchPlus, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SourceBadge } from "@/components/shared/badges";
import { ConfirmDialog, UploadDialog } from "@/components/shared/dialogs";
import { DocumentStatus } from "@/components/shared/DocumentStatus";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { useAppSettings, useScope } from "@/context/app";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { DocumentItem } from "@/lib/types";
import { downloadUrl, formatBytes, timeAgo } from "@/lib/utils";

export default function Documents() {
  const { projectId, currentProject } = useScope();
  const { data: settings } = useAppSettings();
  const navigate = useNavigate();
  const refresh = useRefreshAll();
  const { data: docs, isLoading, error, refetch } = useQuery({
    queryKey: ["documents", { project_id: projectId }],
    queryFn: () => api.documents({ project_id: projectId }),
    refetchInterval: (q) => (q.state.data?.some((d) => d.latest_version && ["queued", "processing"].includes(d.latest_version.status)) ? 2000 : false),
  });
  const [q, setQ] = useState("");
  const [upload, setUpload] = useState<{ open: boolean; doc?: DocumentItem }>({ open: false });
  const [toDelete, setToDelete] = useState<DocumentItem | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteDocument(id),
    onSuccess: () => {
      refresh();
      setToDelete(null);
      toast.success("Document deleted");
    },
  });

  const rows = useMemo(() => (docs ?? []).filter((d) => !q || d.title.toLowerCase().includes(q.toLowerCase())), [docs, q]);

  return (
    <>
      <PageHeader
        title="Documents"
        description={currentProject ? `Specifications in ${currentProject.name}.` : "Specifications across all projects. Each upload of a newer version is compared with the last one."}
        actions={
          <Button variant="primary" onClick={() => setUpload({ open: true })}>
            <FileUp /> Upload document
          </Button>
        }
      />

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" className="h-8 pl-9" aria-label="Search documents" />
          </div>
          <span className="ml-auto text-xs text-ink-3">{rows.length} documents</span>
        </div>
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileStack />}
            title={docs?.length ? "No documents match" : "No documents yet"}
            description={docs?.length ? "Try a different search." : "Upload a specification PDF. SpecLens extracts headings, tables and requirements automatically."}
            action={
              !docs?.length && (
                <Button variant="primary" onClick={() => setUpload({ open: true })}>
                  <FileUp /> Upload document
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b bg-surface-2 text-left text-xs text-ink-3">
                  <th className="px-4 py-2.5 font-medium">Document</th>
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 font-medium">Version</th>
                  <th className="px-3 py-2.5 text-right font-medium">Requirements</th>
                  <th className="px-3 py-2.5 font-medium">Analysis</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Updated</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((d) => (
                  <tr key={d.id} className="cursor-pointer hover:bg-surface-2" onClick={() => navigate(`/documents/${d.id}`)}>
                    <td className="px-4 py-3">
                      <Link to={`/documents/${d.id}`} className="font-medium text-ink hover:text-brand-ink" onClick={(e) => e.stopPropagation()}>
                        {d.title}
                      </Link>
                      <div className="text-xs text-ink-3">
                        {d.doc_type}
                        {d.latest_version && `, ${d.latest_version.page_count || "–"} pages, ${formatBytes(d.latest_version.file_size)}`}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{d.project_name}</td>
                    <td className="px-3 py-3">
                      <span className="font-medium">v{d.latest_version?.version_number ?? 1}</span>
                      <span className="text-ink-3"> of {d.version_count}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular">{d.requirement_count}</td>
                    <td className="px-3 py-3">{d.latest_version?.status === "ready" && <SourceBadge source={d.latest_version.analysis_source} />}</td>
                    <td className="px-3 py-3">{d.latest_version && <DocumentStatus version={d.latest_version} compact />}</td>
                    <td className="px-3 py-3 text-ink-3">{timeAgo(d.updated_at)}</td>
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="rounded-md p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={`Actions for ${d.title}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setUpload({ open: true, doc: d })} disabled={d.latest_version?.status !== "ready"}>
                            <GitBranchPlus /> Upload new version
                          </DropdownMenuItem>
                          {d.latest_version && (
                            <DropdownMenuItem onSelect={() => window.open(api.versionFileUrl(d.latest_version!.id), "_blank")}>
                              <ExternalLink /> Open original PDF
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem danger onSelect={() => setToDelete(d)}>
                            <Trash2 /> Delete document
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {settings?.samples.length ? (
        <section className="mt-5 rounded-lg border border-dashed p-4">
          <h2 className="text-[13.5px] font-semibold">Sample specifications</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            Download a sample PDF to try uploading. Upload the banking v1.0 file as a new document, then v1.1 as its next version to see change analysis.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {settings.samples.map((s) => (
              <Button key={s.name} size="sm" variant="secondary" onClick={() => downloadUrl(api.sampleUrl(s.name))}>
                <Download /> {s.name}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <UploadDialog
        open={upload.open}
        onOpenChange={(o) => setUpload((u) => ({ ...u, open: o }))}
        documentId={upload.doc?.id}
        documentTitle={upload.doc?.title}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.title ?? "document"}?`}
        description="All versions, extracted requirements, their test cases and change history are permanently deleted."
        confirmLabel="Delete document"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}
