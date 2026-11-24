import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

/* ----------------------------------------------------------------- Theme */
export type Theme = "light" | "dark" | "system";
const ThemeCtx = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void } | null>(null);

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("speclens-theme");
    return t === "dark" || t === "system" ? t : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("speclens-theme", t);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}

/* ----------------------------------------------------------------- Scope */
interface ScopeValue {
  projectId: number | undefined;
  setProjectId: (id: number | undefined) => void;
  projects: Project[];
  currentProject: Project | undefined;
}
const ScopeCtx = createContext<ScopeValue | null>(null);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<number | undefined>(() => {
    try {
      const v = Number(localStorage.getItem("speclens-scope"));
      return v > 0 ? v : undefined;
    } catch {
      return undefined;
    }
  });
  const { data: projects = [], isSuccess } = useQuery({ queryKey: ["projects"], queryFn: () => api.projects() });

  const setProjectId = useCallback((id: number | undefined) => {
    setProjectIdState(id);
    try {
      if (id) localStorage.setItem("speclens-scope", String(id));
      else localStorage.removeItem("speclens-scope");
    } catch {
      /* ignore */
    }
  }, []);

  // Drop a scope that points at a deleted project.
  useEffect(() => {
    if (isSuccess && projectId && !projects.some((p) => p.id === projectId)) setProjectId(undefined);
  }, [isSuccess, projects, projectId, setProjectId]);

  const value = useMemo(
    () => ({ projectId, setProjectId, projects, currentProject: projects.find((p) => p.id === projectId) }),
    [projectId, setProjectId, projects],
  );
  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeCtx);
  if (!ctx) throw new Error("useScope outside ScopeProvider");
  return ctx;
}

/* ----------------------------------------------------------- Breadcrumbs */
const CrumbCtx = createContext<{ label: string | null; setLabel: (l: string | null) => void } | null>(null);

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return <CrumbCtx.Provider value={{ label, setLabel }}>{children}</CrumbCtx.Provider>;
}

export function useCrumbLabel() {
  return useContext(CrumbCtx)?.label ?? null;
}

/** Detail pages call this to name the last breadcrumb. */
export function useCrumb(label: string | undefined) {
  const ctx = useContext(CrumbCtx);
  useEffect(() => {
    ctx?.setLabel(label ?? null);
    return () => ctx?.setLabel(null);
  }, [label]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* -------------------------------------------------------------- Settings */
export function useAppSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: api.settings, staleTime: 60_000 });
}
