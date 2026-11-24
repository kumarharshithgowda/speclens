import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string): string {
  const date = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(iso: string): string {
  const date = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function plural(n: number, word: string, pluralWord?: string): string {
  return `${n} ${n === 1 ? word : pluralWord ?? `${word}s`}`;
}

export const TEST_TYPE_LABEL: Record<string, string> = {
  positive: "Positive",
  negative: "Negative",
  edge_case: "Edge case",
  functional: "Functional",
  regression: "Regression",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
  draft: "Draft",
  ready: "Ready",
  needs_review: "Needs review",
  obsolete: "Obsolete",
  reviewed: "Reviewed",
  approved: "Approved",
};

export const CATEGORIES = [
  "Functional", "Security", "Performance", "Reliability", "Usability",
  "Compliance", "Data", "Integration", "Reporting", "Notification",
];
export const LEVELS = ["Low", "Medium", "High", "Critical"] as const;
export const TEST_TYPES = ["positive", "negative", "edge_case", "functional", "regression"] as const;

export const PROJECT_COLORS: Record<string, string> = {
  teal: "#0f8a7e",
  indigo: "#4453c9",
  amber: "#c98500",
  rose: "#d1496f",
  sky: "#2a78d6",
  violet: "#6f55d6",
  emerald: "#178a4c",
  slate: "#58657a",
};

export function downloadUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
