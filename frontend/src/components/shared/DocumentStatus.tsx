import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Check, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { Version } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "extracting", label: "Reading PDF structure" },
  { key: "mining", label: "Finding requirements" },
  { key: "analyzing", label: "Analysing requirements" },
  { key: "done", label: "Ready" },
];

function stageIndex(v: Version) {
  if (v.status === "ready") return 3;
  if (v.stage === "comparing" || v.stage === "analyzing") return 2;
  if (v.stage === "mining") return 1;
  return 0;
}

export function DocumentStatus({ version, compact }: { version: Version; compact?: boolean }) {
  const refresh = useRefreshAll();
  const retry = useMutation({
    mutationFn: () => api.reprocess(version.id),
    onSuccess: () => {
      refresh();
      toast.success("Processing restarted");
    },
  });

  if (compact) {
    if (version.status === "ready")
      return (
        <Chip className="border-insert/30 bg-insert-soft text-insert">
          <Check /> Ready
        </Chip>
      );
    if (version.status === "failed")
      return (
        <Chip className="border-redline/30 bg-redline-soft text-redline">
          <AlertCircle /> Failed
        </Chip>
      );
    return (
      <Chip className="border-brand/25 bg-brand-soft text-brand-ink">
        <Loader2 className="animate-spin" /> {version.progress}%
      </Chip>
    );
  }

  if (version.status === "failed") {
    return (
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-redline/30 bg-redline-soft p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 text-redline" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">Processing failed for v{version.version_number}</div>
          <p className="mt-0.5 text-[13px] text-ink-2">{version.error ?? "Unknown error."}</p>
        </div>
        <Button size="sm" onClick={() => retry.mutate()} loading={retry.isPending}>
          {!retry.isPending && <RotateCw />} Retry processing
        </Button>
      </div>
    );
  }
  if (version.status === "ready") return null;

  const idx = stageIndex(version);
  const comparing = version.stage === "comparing";
  return (
    <div className="rounded-lg border border-brand/25 bg-brand-soft/50 p-4" role="status" aria-live="polite">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          Processing {version.filename}
        </div>
        <span className="text-xs tabular text-ink-2">{version.progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(version.progress, 4)}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((s, i) => (
          <li key={s.key} className={cn("flex items-center gap-1.5 text-xs", i < idx ? "text-insert" : i === idx ? "font-medium text-ink" : "text-ink-3")}>
            {i < idx ? <Check className="h-3.5 w-3.5" /> : i === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5 rounded-full border" />}
            {i === 2 && comparing ? "Comparing with previous version" : s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
