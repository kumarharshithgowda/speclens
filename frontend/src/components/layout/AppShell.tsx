import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  FileStack,
  FlaskConical,
  FolderKanban,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Network,
  FileBarChart,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Sun,
  Monitor,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Logo } from "@/components/layout/Logo";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { Select } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlay";
import { useAppSettings, useCrumbLabel, useScope, useTheme } from "@/context/app";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/documents", label: "Documents", icon: FileStack },
  { to: "/requirements", label: "Requirements", icon: ScrollText },
  { to: "/changes", label: "Change Analysis", icon: GitCompareArrows, badge: "alerts" as const },
  { to: "/test-cases", label: "Test Cases", icon: ListChecks },
  { to: "/traceability", label: "Traceability", icon: Network },
  { to: "/reports", label: "Reports", icon: FileBarChart },
];

const SECTION_LABEL: Record<string, string> = {
  projects: "Projects",
  documents: "Documents",
  requirements: "Requirements",
  changes: "Change Analysis",
  "test-cases": "Test Cases",
  traceability: "Traceability",
  reports: "Reports",
  settings: "Settings",
};

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { projectId } = useScope();
  const { data: changes } = useQuery({
    queryKey: ["changes", { projectId }],
    queryFn: () => api.changeSets({ project_id: projectId }),
  });
  const alerts = changes?.filter((c) => !c.acknowledged).length ?? 0;
  const { data: settings } = useAppSettings();

  return (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="flex h-16 items-center px-5">
        <Logo />
      </Link>
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex h-9 items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium transition-colors",
                isActive ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
              )
            }
          >
            <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.9} />
            <span className="flex-1">{label}</span>
            {badge === "alerts" && alerts > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-redline px-1.5 text-[11px] font-semibold text-white tabular">
                {alerts}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 border-t px-3 py-3">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex h-9 items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium",
              isActive ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
            )
          }
        >
          <Settings className="h-[17px] w-[17px]" strokeWidth={1.9} />
          Settings
        </NavLink>
        {settings && (
          <Link
            to="/settings"
            onClick={onNavigate}
            className={cn(
              "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs",
              settings.ai.mode === "ai" ? "border-brand/20 bg-brand-soft/60" : "border-demo/25 bg-demo-soft/70",
            )}
          >
            {settings.ai.mode === "ai" ? (
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-ink" />
            ) : (
              <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-demo" />
            )}
            <span>
              <span className={cn("block font-semibold", settings.ai.mode === "ai" ? "text-brand-ink" : "text-demo")}>
                {settings.ai.mode === "ai" ? "AI connected" : "Demo mode"}
              </span>
              <span className="text-ink-2">
                {settings.ai.mode === "ai" ? settings.ai.model : "Add an API key for live AI analysis"}
              </span>
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const label = useCrumbLabel();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { to: string; label: string }[] = [{ to: "/", label: "Dashboard" }];
  if (parts[0]) crumbs.push({ to: `/${parts[0]}`, label: SECTION_LABEL[parts[0]] ?? parts[0] });
  if (parts[1]) crumbs.push({ to: pathname, label: label ?? "…" });
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
      {crumbs.map((c, i) => (
        <span key={c.to + i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium text-ink" aria-current="page">
              {c.label}
            </span>
          ) : (
            <Link to={c.to} className="truncate text-ink-3 hover:text-ink">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function ThemeMenu() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <Tooltip content="Appearance">
        <DropdownMenuTrigger className="grid h-8 w-8 place-items-center rounded-md text-ink-2 hover:bg-ink/5 hover:text-ink" aria-label="Change theme">
          {resolved === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent>
        {(
          [
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "Match system", Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon /> <span className="flex-1">{label}</span>
            {theme === value && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { projectId, setProjectId, projects } = useScope();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 border-r bg-surface lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[hsl(222_40%_8%/0.4)] animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] border-r bg-surface animate-in slide-in-from-left duration-200">
            <button className="absolute right-3 top-5 rounded-md p-1 text-ink-3 hover:bg-ink/5" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface/85 px-4 backdrop-blur lg:px-6">
          <button className="rounded-md p-1.5 text-ink-2 hover:bg-ink/5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
          <Select
            size="sm"
            aria-label="Project scope"
            className="hidden w-[210px] md:inline-flex"
            value={projectId ? String(projectId) : ""}
            onChange={(v) => setProjectId(v ? Number(v) : undefined)}
            allLabel="All projects"
            options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
          />
          <button
            onClick={() => setCmdOpen(true)}
            className="flex h-8 items-center gap-2 rounded-md border bg-surface-2 px-2.5 text-[13px] text-ink-3 hover:border-ink-3/40 hover:text-ink-2"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded border bg-surface px-1 font-sans text-[11px] sm:inline">Ctrl K</kbd>
          </button>
          <ThemeMenu />
        </header>
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-8 lg:py-7">{children}</div>
        </main>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
