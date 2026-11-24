import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortState<K extends string> = { key: K; dir: "asc" | "desc" } | null;

export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  k: K;
  sort: SortState<K>;
  onSort: (s: SortState<K>) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort?.key === k;
  return (
    <th className={cn("px-3 py-2.5 font-medium", className)} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink", align === "right" && "flex-row-reverse")}
        onClick={() => onSort(!active ? { key: k, dir: "asc" } : sort!.dir === "asc" ? { key: k, dir: "desc" } : null)}
      >
        {label}
        {active ? sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-50" />}
      </button>
    </th>
  );
}

export function Pagination({ page, pages, total, pageSize, setPage }: { page: number; pages: number; total: number; pageSize: number; setPage: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-ink-3">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular">
          Page {page} of {pages}
        </span>
        <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
        active ? "border-brand bg-brand-soft text-brand-ink" : "bg-surface text-ink-2 hover:border-ink-3/50",
      )}
    >
      {children}
    </button>
  );
}

export function SelectionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 lg:pl-[248px]">
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-ink py-2 pl-4 pr-2 text-surface shadow-pop animate-zoom-in">
        <span className="text-[13px] font-medium tabular">{count} selected</span>
        <span className="mx-1 h-5 w-px bg-surface/20" />
        {children}
        <button onClick={onClear} className="rounded-md p-1.5 text-surface/70 hover:bg-surface/10 hover:text-surface" aria-label="Clear selection">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const LEVEL_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
export function compareBy<T>(a: T, b: T, key: keyof T): number {
  const va = a[key] as unknown;
  const vb = b[key] as unknown;
  if (typeof va === "string" && va in LEVEL_RANK && typeof vb === "string" && vb in LEVEL_RANK) return LEVEL_RANK[va] - LEVEL_RANK[vb];
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  if (typeof va === "boolean" && typeof vb === "boolean") return Number(va) - Number(vb);
  return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true });
}
