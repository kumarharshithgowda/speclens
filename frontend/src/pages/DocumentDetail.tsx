import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, GitBranchPlus, GitCompareArrows, Info, ListTree, MoreHorizontal, Pencil, ScrollText, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CategoryTag, LevelBadge, SourceBadge } from "@/components/shared/badges";
import { ConfirmDialog, UploadDialog } from "@/components/shared/dialogs";
import { DocumentStatus } from "@/components/shared/DocumentStatus";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/shared/feedback";
import { RequirementDrawer } from "@/components/shared/RequirementDrawer";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/select";
import { useCrumb } from "@/context/app";
import { api } from "@/lib/api";
import { useDebounced, useRefreshAll } from "@/lib/hooks";
import type { Section, Version } from "@/lib/types";
import { cn, formatBytes, formatDate, timeAgo } from "@/lib/utils";

export default function DocumentDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const refresh = useRefreshAll();
  const { data: doc, error, refetch } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.document(id),
    refetchInterval: (q) => (q.state.data?.versions?.some((v) => ["queued", "processing"].includes(v.status)) ? 1500 : false),
  });
  useCrumb(doc?.title);

  const versions = doc?.versions ?? [];
  const latest = versions[0];
  const readyVersions = versions.filter((v) => v.status === "ready");
  const [versionId, setVersionId] = useState<number | null>(null);
  const shown = versions.find((v) => v.id === versionId) ?? readyVersions[0];
  const [tab, setTab] = useState("content");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState<number | null>(null);

  // When processing finishes, refresh everything that depends on it.
  const prevStatus = useRef<string | undefined>();
  useEffect(() => {
    if (prevStatus.current && prevStatus.current !== "ready" && latest?.status === "ready") {
      refresh();
      toast.success(`${doc?.title} v${latest.version_number} is ready`, {
        description: latest.version_number > 1 ? "Change analysis is available." : `${latest.stats.requirements ?? 0} requirement statements found.`,
      });
      setVersionId(null);
    }
    prevStatus.current = latest?.status;
  }, [latest?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useMutation({
    mutationFn: () => api.deleteDocument(id),
    onSuccess: () => {
      refresh();
      toast.success("Document deleted");
      navigate("/documents");
    },
  });

  if (error)
    return (
      <div className="panel">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );

  return (
    <>
      <PageHeader
        title={doc?.title ?? <Skeleton className="h-6 w-80" />}
        description={
          doc && (
            <span>
              <Link to={`/projects/${doc.project_id}`} className="text-brand-ink hover:underline">
                {doc.project_name}
              </Link>
              {`, ${doc.doc_type}, ${doc.version_count} version${doc.version_count === 1 ? "" : "s"}`}
            </span>
          )
        }
        actions={
          doc && (
            <>
              {versions.length > 1 && (
                <Button asChild>
                  <Link to={`/changes?document=${id}`}>
                    <GitCompareArrows /> Compare versions
                  </Link>
                </Button>
              )}
              <Button variant="primary" onClick={() => setUploadOpen(true)} disabled={!latest || latest.status !== "ready"}>
                <GitBranchPlus /> Upload new version
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" aria-label="Document actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {shown && (
                    <DropdownMenuItem onSelect={() => window.open(api.versionFileUrl(shown.id), "_blank")}>
                      <ExternalLink /> Open original PDF
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => setConfirm(true)}>
                    <Trash2 /> Delete document
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      {latest && latest.status !== "ready" && (
        <div className="mb-5">
          <DocumentStatus version={latest} />
        </div>
      )}

      {shown && (
        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Pages", shown.page_count],
            ["Headings", shown.stats.headings ?? 0],
            ["Tables", shown.stats.tables ?? 0],
            ["Key statements", shown.stats.statements ?? 0],
            ["Requirements", shown.stats.requirements ?? 0],
            ["Words", (shown.stats.words ?? 0).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-3">
              <div className="text-xs text-ink-3">{label}</div>
              <div className="mt-0.5 text-lg font-semibold tabular">{value}</div>
            </div>
          ))}
        </div>
      )}

      {!doc ? (
        <Skeleton className="h-96 w-full" />
      ) : !shown ? (
        latest?.status === "failed" ? null : (
          <div className="panel p-10 text-center text-[13px] text-ink-2">Content appears here once processing finishes.</div>
        )
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="flex-1 border-b-0">
              <TabsTrigger value="content">
                <ListTree className="h-4 w-4" /> Structured content
              </TabsTrigger>
              <TabsTrigger value="requirements" count={doc.requirement_count}>
                <ScrollText className="h-4 w-4" /> Requirements
              </TabsTrigger>
              <TabsTrigger value="versions" count={versions.length}>
                <GitBranchPlus className="h-4 w-4" /> Versions
              </TabsTrigger>
            </TabsList>
            {tab === "content" && readyVersions.length > 1 && (
              <Select
                size="sm"
                className="w-48"
                aria-label="Version"
                value={String(shown.id)}
                onChange={(v) => setVersionId(Number(v))}
                options={readyVersions.map((v) => ({ value: String(v.id), label: `Version ${v.version_number}${v.id === readyVersions[0].id ? " (latest)" : ""}` }))}
              />
            )}
          </div>
          <div className="mt-3 border-t" />
          <TabsContent value="content" className="mt-4 outline-none">
            <ContentViewer version={shown} />
          </TabsContent>
          <TabsContent value="requirements" className="mt-4 outline-none">
            <DocRequirements documentId={id} onOpen={setDrawer} />
          </TabsContent>
          <TabsContent value="versions" className="mt-4 outline-none">
            <VersionTimeline versions={versions} documentId={id} />
          </TabsContent>
        </Tabs>
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} documentId={id} documentTitle={doc?.title} />
      {doc && <RenameDialog open={renameOpen} onOpenChange={setRenameOpen} id={id} title={doc.title} docType={doc.doc_type} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${doc?.title ?? "document"}?`}
        description="All versions, extracted requirements, linked test cases and change history are permanently deleted."
        confirmLabel="Delete document"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <RequirementDrawer requirementId={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded-[2px] bg-warning/40 px-0.5 text-ink">{p}</mark> : p));
}

function ContentViewer({ version }: { version: Version }) {
  const { data: sections, isLoading } = useQuery({ queryKey: ["sections", version.id], queryFn: () => api.sections(version.id) });
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 150);
  const [onlyReqs, setOnlyReqs] = useState(false);

  const visible = useMemo(() => {
    let list = sections ?? [];
    if (onlyReqs) list = list.filter((s) => s.is_requirement || s.kind === "heading");
    if (query) {
      const lq = query.toLowerCase();
      list = list.filter((s) => s.text.toLowerCase().includes(lq) || s.table?.some((r) => r.some((c) => c.toLowerCase().includes(lq))));
    }
    return list;
  }, [sections, query, onlyReqs]);
  const headings = (sections ?? []).filter((s) => s.kind === "heading");

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <nav className="panel hidden max-h-[calc(100vh-180px)] self-start overflow-y-auto p-3 scrollbar-thin lg:sticky lg:top-0 lg:block" aria-label="Document outline">
        <div className="mb-2 px-2 text-xs font-medium text-ink-3">Outline</div>
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#sec-${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`sec-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="block truncate rounded px-2 py-1 text-[13px] text-ink-2 hover:bg-ink/5 hover:text-ink"
            style={{ paddingLeft: `${8 + (Math.min(h.level, 4) - 1) * 12}px` }}
          >
            {h.text}
          </a>
        ))}
      </nav>
      <div className="panel min-w-0">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-t-lg border-b bg-surface/95 px-4 py-2.5 backdrop-blur">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this document" className="h-8 pl-9" aria-label="Search this document" />
          </div>
          <button
            onClick={() => setOnlyReqs((v) => !v)}
            aria-pressed={onlyReqs}
            className={cn("h-8 rounded-md border px-3 text-[13px]", onlyReqs ? "border-brand bg-brand-soft text-brand-ink" : "text-ink-2 hover:border-ink-3/50")}
          >
            Requirement passages only
          </button>
          <span className="ml-auto flex items-center gap-3 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-1 rounded-full bg-brand" /> contains requirements
            </span>
            {query && <span>{visible.length} matches</span>}
          </span>
        </div>
        <article className="px-6 py-5 lg:px-10">
          {visible.length === 0 ? (
            <EmptyState icon={<Search />} title="No passages match" description="Try another search term." className="py-10" />
          ) : (
            visible.map((s) => <Block key={s.id} s={s} q={query} />)
          )}
        </article>
      </div>
    </div>
  );
}

function Block({ s, q }: { s: Section; q: string }) {
  const marker = s.is_requirement ? "before:absolute before:-left-4 before:top-1 before:h-[calc(100%-8px)] before:w-[3px] before:rounded-full before:bg-brand lg:before:-left-5" : "";
  if (s.kind === "heading") {
    const size = s.level <= 1 ? "text-[17px] mt-7" : s.level === 2 ? "text-[15px] mt-5" : "text-[14px] mt-4";
    return (
      <h3 id={`sec-${s.id}`} className={cn("scroll-mt-20 font-semibold text-ink first:mt-0", size)}>
        {highlight(s.text, q)}
        <span className="ml-2 align-middle text-[11px] font-normal text-ink-3">p.{s.page}</span>
      </h3>
    );
  }
  if (s.kind === "table" && s.table) {
    const [head, ...body] = s.table;
    return (
      <div className={cn("relative my-3 overflow-x-auto rounded-md border", marker)}>
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2">
            <tr>
              {head.map((h, i) => (
                <th key={i} className="border-b px-3 py-2 text-left font-semibold">
                  {highlight(h, q)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i} className="px-3 py-2 align-top text-ink-2">
                    {highlight(c, q)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (s.kind === "statement") {
    return (
      <div className={cn("relative my-3 flex gap-2.5 rounded-md border border-warning/40 bg-warning/[0.08] px-3.5 py-2.5 text-[13.5px] leading-relaxed", marker)}>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(38_90%_40%)]" />
        <span>{highlight(s.text, q)}</span>
      </div>
    );
  }
  if (s.kind === "list") {
    return (
      <div className={cn("relative my-1.5 flex gap-2.5 pl-1 text-[14px] leading-[1.7] text-ink", marker)}>
        <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
        <span>{highlight(s.text, q)}</span>
      </div>
    );
  }
  return <p className={cn("relative my-2.5 max-w-[72ch] text-[14px] leading-[1.7] text-ink", marker)}>{highlight(s.text, q)}</p>;
}

function DocRequirements({ documentId, onOpen }: { documentId: number; onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["requirements", { document_id: documentId }],
    queryFn: () => api.requirements({ document_id: documentId }),
  });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data?.length) return <div className="panel"><EmptyState icon={<ScrollText />} title="No requirements found" description="No obligation statements (shall, must, should) or requirement IDs were detected." /></div>;
  return (
    <div className="panel overflow-hidden">
      <ul className="divide-y">
        {data.map((r) => (
          <li key={r.id}>
            <button onClick={() => onOpen(r.id)} className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-surface-2">
              <span className="code-id w-16 shrink-0 pt-0.5">{r.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">{r.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{r.description}</span>
              </span>
              <span className="hidden shrink-0 items-center gap-1.5 md:flex">
                <CategoryTag category={r.category} />
                <LevelBadge level={r.priority} />
                <SourceBadge source={r.analysis_source} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersionTimeline({ versions, documentId }: { versions: Version[]; documentId: number }) {
  return (
    <ol className="relative space-y-4 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-line">
      {versions.map((v, i) => (
        <li key={v.id} className="relative">
          <span className={cn("absolute -left-6 top-4 h-3.5 w-3.5 rounded-full border-2 bg-surface", i === 0 ? "border-brand" : "border-line")} />
          <div className="panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold">Version {v.version_number}</span>
              {v.label && v.label !== `v${v.version_number}` && <span className="text-[13px] text-ink-2">{v.label}</span>}
              {i === 0 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-ink">Latest</span>}
              <span className="ml-auto">
                <DocumentStatus version={v} compact />
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> {v.filename}
              </span>
              <span>{formatBytes(v.file_size)}</span>
              <span>Uploaded {formatDate(v.uploaded_at)}</span>
              {v.processed_at && <span>Processed {timeAgo(v.processed_at)}</span>}
              {v.status === "ready" && <SourceBadge source={v.analysis_source} />}
            </div>
            {v.status === "ready" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <span>{v.stats.requirements ?? 0} requirement statements</span>
                <span className="text-ink-3">/</span>
                <span>{v.stats.headings ?? 0} headings</span>
                <span className="text-ink-3">/</span>
                <span>{v.stats.tables ?? 0} tables</span>
                {v.version_number > 1 && (
                  <Button asChild size="sm" variant="soft" className="ml-auto">
                    <Link to={`/changes?document=${documentId}&to=${v.version_number}`}>
                      <GitCompareArrows /> Changes from v{v.version_number - 1}
                    </Link>
                  </Button>
                )}
              </div>
            )}
            {v.status === "failed" && <p className="mt-2 text-[13px] text-redline">{v.error}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function RenameDialog({ open, onOpenChange, id, title, docType }: { open: boolean; onOpenChange: (o: boolean) => void; id: number; title: string; docType: string }) {
  const [value, setValue] = useState(title);
  const [type, setType] = useState(docType);
  const refresh = useRefreshAll();
  useEffect(() => {
    if (open) {
      setValue(title);
      setType(docType);
    }
  }, [open, title, docType]);
  const save = useMutation({
    mutationFn: () => api.updateDocument(id, { title: value.trim(), doc_type: type }),
    onSuccess: () => {
      refresh();
      onOpenChange(false);
      toast.success("Document renamed");
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Rename document">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim().length >= 2) save.mutate();
          }}
        >
          <Field label="Title" error={value.trim().length < 2 ? "Enter at least 2 characters." : null}>
            <Input value={value} maxLength={200} onChange={(e) => setValue(e.target.value)} autoFocus />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={setType} options={["SRS", "PRD", "FSD", "BRD", "Spec", "Other"].map((t) => ({ value: t, label: t }))} className="w-full" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
