import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: React.ReactNode;
}

const ALL = "__all__";

/** Single-select built on Radix. An empty string value means "no selection" (shown via `placeholder`). */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allLabel,
  className,
  size = "md",
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  allLabel?: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const internal = value === "" && allLabel ? ALL : value || undefined;
  return (
    <SelectPrimitive.Root value={internal} onValueChange={(v) => onChange(v === ALL ? "" : v)} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex min-w-0 items-center justify-between gap-2 rounded-md border bg-surface px-3 text-left text-ink hover:border-ink-3/50 data-[placeholder]:text-ink-3 disabled:opacity-60",
          size === "sm" ? "h-8 text-[13px]" : "h-9 text-sm",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-surface shadow-pop data-[state=open]:animate-zoom-in"
        >
          <SelectPrimitive.Viewport className="p-1">
            {allLabel && <Item value={ALL}>{allLabel}</Item>}
            {options.map((o) => (
              <Item key={o.value} value={o.value}>
                {o.label}
              </Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function Item({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-[5px] py-1.5 pl-7 pr-2 text-[13px] text-ink outline-none data-[highlighted]:bg-ink/5"
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2">
        <Check className="h-3.5 w-3.5 text-brand" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

/* ------------------------------------------------------------------- Tabs */
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn("flex items-center gap-1 border-b", className)}>{children}</TabsPrimitive.List>;
}

export function TabsTrigger({ value, children, count }: { value: string; children: React.ReactNode; count?: number }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="relative -mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink"
    >
      {children}
      {count !== undefined && <span className="rounded-full bg-ink/5 px-1.5 text-2xs tabular text-ink-2">{count}</span>}
    </TabsPrimitive.Trigger>
  );
}
