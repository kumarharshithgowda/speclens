import { useMutation } from "@tanstack/react-query";
import { Check, FileUp, FileText, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { useAppSettings, useScope } from "@/context/app";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { Project, TestType } from "@/lib/types";
import { cn, formatBytes, PROJECT_COLORS, TEST_TYPE_LABEL, TEST_TYPES } from "@/lib/utils";

/* ----------------------------------------------------------- Confirm */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <div className="text-[13.5px] leading-relaxed text-ink-2">{description}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- Project */
export function ProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project?: Project;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("teal");
  const [status, setStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);
  const refresh = useRefreshAll();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setDescription(project?.description ?? "");
      setColor(project?.color ?? "teal");
      setStatus(project?.status ?? "active");
      setError(null);
    }
  }, [open, project]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), color, status } as Partial<Project>;
      return project ? api.updateProject(project.id, body) : api.createProject(body);
    },
    onSuccess: (p) => {
      refresh();
      toast.success(project ? "Project updated" : "Project created");
      onOpenChange(false);
      if (!project) navigate(`/projects/${p.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Enter a project name of at least 2 characters.");
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={project ? "Edit project" : "New project"} description="Projects group the specifications, requirements and tests of one product.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="p-name" error={error}>
            <Input id="p-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aurora Online Banking" />
          </Field>
          <Field label="Description" htmlFor="p-desc" hint="Optional. Shown on the project card.">
            <Textarea id="p-desc" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="What is being built and for whom" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: "Active" },
                  { value: "on_hold", label: "On hold" },
                  { value: "completed", label: "Completed" },
                  { value: "archived", label: "Archived" },
                ]}
                className="w-full"
              />
            </Field>
            <Field label="Colour">
              <div className="flex h-9 items-center gap-1.5">
                {Object.entries(PROJECT_COLORS).map(([key, hex]) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={key}
                    onClick={() => setColor(key)}
                    className={cn("grid h-6 w-6 place-items-center rounded-full ring-offset-2 ring-offset-surface", color === key && "ring-2 ring-ink/40")}
                    style={{ background: hex }}
                  >
                    {color === key && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ Upload */
export function PdfDropzone({ file, onFile, maxMb }: { file: File | null; onFile: (f: File | null) => void; maxMb: number }) {
  const [error, setError] = useState<string | null>(null);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: maxMb * 1024 * 1024,
    onDropAccepted: (files) => {
      setError(null);
      onFile(files[0]);
    },
    onDropRejected: (rej) => {
      const code = rej[0]?.errors[0]?.code;
      setError(code === "file-too-large" ? `The file is larger than ${maxMb} MB.` : "Only PDF files are supported.");
    },
  });

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-surface-2 p-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-redline-soft text-redline">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">{file.name}</div>
          <div className="text-xs text-ink-3">{formatBytes(file.size)} PDF</div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => onFile(null)} aria-label="Remove file">
          <X />
        </Button>
      </div>
    );
  }
  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-9 text-center transition-colors",
          isDragActive ? "border-brand bg-brand-soft/60" : "border-line hover:border-ink-3/50 hover:bg-surface-2",
        )}
      >
        <input {...getInputProps()} aria-label="PDF file" />
        <FileUp className={cn("mb-3 h-7 w-7", isDragActive ? "text-brand" : "text-ink-3")} strokeWidth={1.6} />
        <div className="text-[13.5px] font-medium text-ink">{isDragActive ? "Drop the PDF to upload" : "Drag a PDF here, or click to browse"}</div>
        <div className="mt-1 text-xs text-ink-3">Text-based PDF up to {maxMb} MB. Scanned images need OCR first.</div>
      </div>
      {error && <p className="mt-2 text-xs text-redline">{error}</p>}
    </div>
  );
}

export function UploadDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  documentId?: number;
  documentTitle?: string;
  defaultProjectId?: number;
}) {
  const { projects, projectId: scopeId } = useScope();
  const { data: settings } = useAppSettings();
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("SRS");
  const [label, setLabel] = useState("");
  const refresh = useRefreshAll();
  const navigate = useNavigate();
  const isVersion = documentId !== undefined;

  useEffect(() => {
    if (open) {
      setFile(null);
      setTitle("");
      setLabel("");
      setDocType("SRS");
      setProjectId(String(defaultProjectId ?? scopeId ?? projects[0]?.id ?? ""));
    }
  }, [open, defaultProjectId, scopeId, projects]);

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", file!);
      if (isVersion) {
        form.append("label", label);
        await api.uploadVersion(documentId!, form);
        return documentId!;
      }
      form.append("project_id", projectId);
      form.append("title", title);
      form.append("doc_type", docType);
      const doc = await api.uploadDocument(form);
      return doc.id;
    },
    onSuccess: (id) => {
      refresh();
      toast.success(isVersion ? "New version uploaded — comparing with the previous version" : "Document uploaded — extraction has started");
      onOpenChange(false);
      navigate(`/documents/${id}`);
    },
  });

  const canSubmit = !!file && (isVersion || !!projectId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isVersion ? "Upload a new version" : "Upload a document"}
        description={
          isVersion
            ? `The new version of ${documentTitle ?? "this document"} is compared requirement by requirement; affected tests are flagged.`
            : "SpecLens extracts structure and requirements, then analyses each requirement."
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) upload.mutate();
          }}
        >
          {!isVersion && projects.length === 0 && (
            <p className="rounded-md border border-demo/30 bg-demo-soft px-3 py-2 text-[13px] text-demo">Create a project first — documents always belong to a project.</p>
          )}
          <PdfDropzone file={file} onFile={setFile} maxMb={settings?.limits.max_upload_mb ?? 25} />
          {isVersion ? (
            <Field label="Version label" hint="Optional, e.g. “v1.2 — CR-118”.">
              <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="v2" />
            </Field>
          ) : (
            <>
              <Field label="Project">
                <Select
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="Choose a project"
                  options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                  className="w-full"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Title" hint="Defaults to the file name.">
                  <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name.replace(/\.pdf$/i, "") ?? "Document title"} />
                </Field>
                <Field label="Type">
                  <Select
                    value={docType}
                    onChange={setDocType}
                    options={["SRS", "PRD", "FSD", "BRD", "Spec", "Other"].map((t) => ({ value: t, label: t }))}
                    className="w-full"
                  />
                </Field>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={upload.isPending}>
              {upload.isPending ? "Uploading" : isVersion ? "Upload version" : "Upload and analyse"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- Generate */
export function GenerateDialog({
  open,
  onOpenChange,
  requirementIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requirementIds: number[];
  onDone?: () => void;
}) {
  const [types, setTypes] = useState<TestType[]>(["positive", "negative", "edge_case"]);
  const [perType, setPerType] = useState("1");
  const [replace, setReplace] = useState(false);
  const { data: settings } = useAppSettings();
  const refresh = useRefreshAll();
  const navigate = useNavigate();

  const gen = useMutation({
    mutationFn: () => api.generateTests({ requirement_ids: requirementIds, types, per_type: Number(perType), replace_existing: replace }),
    onSuccess: (res) => {
      refresh();
      onOpenChange(false);
      onDone?.();
      toast.success(`Generated ${res.created} test case${res.created === 1 ? "" : "s"}`, {
        description: res.source === "ai" ? "Created by the AI model." : "Created by the demo engine — labelled “Demo”.",
        action: { label: "View tests", onClick: () => navigate("/test-cases") },
      });
    },
  });

  const toggle = (t: TestType) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const total = requirementIds.length * types.length * Number(perType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Generate test cases"
        description={`For ${requirementIds.length} selected requirement${requirementIds.length === 1 ? "" : "s"}. Tests are linked to acceptance criteria for traceability.`}
      >
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[13px] font-medium">Test types</div>
            <div className="flex flex-wrap gap-2">
              {TEST_TYPES.map((t) => {
                const on = types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggle(t)}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                      on ? "border-brand bg-brand-soft text-brand-ink" : "text-ink-2 hover:border-ink-3/50",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                    {TEST_TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cases per type">
              <Select value={perType} onChange={setPerType} options={["1", "2", "3"].map((v) => ({ value: v, label: v }))} className="w-full" />
            </Field>
            <div className="space-y-1.5">
              <div className="text-[13px] font-medium">Existing tests</div>
              <label className="flex h-9 items-center gap-2.5 text-[13px] text-ink-2">
                <Switch checked={replace} onCheckedChange={setReplace} />
                Replace existing tests
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border bg-surface-2 px-3 py-2.5 text-[13px]">
            <span className="text-ink-2">
              About <strong className="text-ink tabular">{total}</strong> test cases will be created
            </span>
            <span className="text-xs text-ink-3">{settings?.ai.mode === "ai" ? `Using ${settings.ai.model}` : "Using the demo engine"}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={types.length === 0 || requirementIds.length === 0} loading={gen.isPending} onClick={() => gen.mutate()}>
            {gen.isPending ? "Generating" : "Generate tests"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
