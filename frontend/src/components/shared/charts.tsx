import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

const axisTick = { fill: "hsl(var(--ink-3))", fontSize: 11.5 };

function TooltipCard({ title, rows }: { title?: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-surface px-3 py-2 text-xs shadow-pop">
      {title && <div className="mb-1 font-medium text-ink">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span className="flex-1">{r.label}</span>
          <span className="font-medium tabular text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars for a magnitude per category — single hue, sorted, value labels at the bar end. */
export function HBarChart({
  data,
  color = "var(--series-1)",
  height,
  unit = "",
}: {
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  const h = height ?? Math.max(120, data.length * 30 + 10);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis type="category" dataKey="name" width={96} tick={axisTick} axisLine={false} tickLine={false} />
        <RTooltip
          cursor={{ fill: "hsl(var(--ink) / 0.04)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipCard title={payload[0].payload.name} rows={[{ label: "Count", value: `${payload[0].value}${unit}` }]} />
            ) : null
          }
        />
        <Bar
          dataKey="value"
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={16}
          label={{ position: "right", fill: "hsl(var(--ink-2))", fontSize: 11.5, formatter: (v: number) => `${v}${unit}` }}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Cumulative trend of two series with crosshair tooltip, legend and end labels. */
export function TrendChart({ data }: { data: { date: string; requirements: number; test_cases: number }[] }) {
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const series = [
    { key: "requirements", label: "Requirements", color: "var(--series-1)" },
    { key: "test_cases", label: "Test cases", color: "var(--series-2)" },
  ] as const;
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-ink-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" tickFormatter={fmt} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
          <RTooltip
            cursor={{ stroke: "hsl(var(--ink-3))", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={fmt(String(label))}
                  rows={series.map((s) => ({
                    label: s.label,
                    color: s.color,
                    value: payload.find((p) => p.dataKey === s.key)?.value as number,
                  }))}
                />
              ) : null
            }
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--surface))" }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Part-to-whole segmented bar with 2px surface gaps, legend and counts. */
export function SegmentBar({
  segments,
  className,
  height = "h-2.5",
  showLegend = true,
}: {
  segments: { label: string; value: number; className: string; hint?: string }[];
  className?: string;
  height?: string;
  showLegend?: boolean;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className={className}>
      <div className={cn("flex w-full gap-[2px] overflow-hidden rounded-full bg-line", height)}>
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <Tooltip key={s.label} content={`${s.label}: ${s.value} (${Math.round((100 * s.value) / total)}%)`}>
                <div className={cn("h-full origin-left animate-grow-x first:rounded-l-full last:rounded-r-full", s.className)} style={{ width: `${(100 * s.value) / total}%` }} />
              </Tooltip>
            ))}
      </div>
      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs text-ink-2" title={s.hint}>
              <span className={cn("h-2 w-2 rounded-full", s.className)} />
              {s.label}
              <span className="font-semibold tabular text-ink">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ring gauge for a single headline percentage. */
export function CoverageRing({ value, size = 132, label = "covered" }: { value: number; size?: number; label?: string }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = value >= 80 ? "hsl(var(--insert))" : value >= 50 ? "hsl(var(--brand))" : "hsl(var(--redline))";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--line))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(value, 100) / 100)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-[26px] font-semibold leading-none tracking-[-0.02em] tabular">{Math.round(value)}%</div>
        <div className="mt-1 text-xs text-ink-3">{label}</div>
      </div>
    </div>
  );
}

export function StackedCoverageBars({ data }: { data: { category: string; covered: number; partial: number; uncovered: number }[] }) {
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const total = d.covered + d.partial + d.uncovered;
        return (
          <div key={d.category} className="grid grid-cols-[110px_1fr_56px] items-center gap-3">
            <span className="truncate text-[13px] text-ink-2">{d.category}</span>
            <SegmentBar
              showLegend={false}
              height="h-2"
              segments={[
                { label: "Covered", value: d.covered, className: "bg-insert" },
                { label: "Partial", value: d.partial, className: "bg-warning" },
                { label: "Uncovered", value: d.uncovered, className: "bg-redline/70" },
              ]}
            />
            <span className="text-right text-xs tabular text-ink-2">
              {d.covered + d.partial}/{total}
            </span>
          </div>
        );
      })}
    </div>
  );
}
