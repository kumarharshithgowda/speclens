import { SegmentBar } from "@/components/shared/charts";
import type { ChangeType, DiffOp } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChangeSpectrum({
  counts,
  showLegend = true,
  includeUnchanged = true,
  height,
  className,
}: {
  className?: string;
  counts: Partial<Record<ChangeType, number>>;
  showLegend?: boolean;
  includeUnchanged?: boolean;
  height?: string;
}) {
  const segments = [
    { label: "Added", value: counts.added ?? 0, className: "bg-insert" },
    { label: "Modified", value: counts.modified ?? 0, className: "bg-brand" },
    { label: "Removed", value: counts.removed ?? 0, className: "bg-redline" },
  ];
  if (includeUnchanged) segments.push({ label: "Unchanged", value: counts.unchanged ?? 0, className: "bg-ink-3/25" });
  return <SegmentBar segments={segments} showLegend={showLegend} height={height} className={className} />;
}

/** Proofreader-style redline: deletions struck in red, insertions underlined in green. */
export function Redline({ ops, side }: { ops: DiffOp[]; side?: "old" | "new" }) {
  return (
    <p className="text-[13.5px] leading-[1.75] text-ink">
      {ops.map((op, i) => {
        if (op.op === "equal") return <span key={i}>{op.text} </span>;
        if (op.op === "delete") {
          if (side === "new") return null;
          return (
            <span key={i}>
              <del className="rounded-[3px] bg-redline-soft px-0.5 text-redline decoration-redline decoration-[1.5px]">{op.text}</del>{" "}
            </span>
          );
        }
        if (side === "old") return null;
        return (
          <span key={i}>
            <ins className="rounded-[3px] bg-insert-soft px-0.5 text-insert no-underline [text-decoration:underline_hsl(var(--insert))_1.5px] [text-underline-offset:3px]">
              {op.text}
            </ins>{" "}
          </span>
        );
      })}
    </p>
  );
}

export function PlainText({ text, tone }: { text: string; tone?: "added" | "removed" }) {
  return (
    <p
      className={cn(
        "text-[13.5px] leading-[1.75]",
        tone === "removed" && "text-redline line-through decoration-redline/70",
        tone === "added" && "text-insert",
        !tone && "text-ink",
      )}
    >
      {text}
    </p>
  );
}
