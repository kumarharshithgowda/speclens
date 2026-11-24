import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Database, FlaskConical, Monitor, Moon, PlugZap, RotateCcw, Sparkles, Sun, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { PageHeader, Panel, Skeleton } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { useAppSettings, useTheme, type Theme } from "@/context/app";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { data: s, isLoading } = useAppSettings();
  const { theme, setTheme } = useTheme();
  const refresh = useRefreshAll();
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; latency_ms?: number } | null>(null);

  const test = useMutation({ mutationFn: api.testAI, onSuccess: setResult });
  const reset = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: () => {
      setConfirm(false);
      refresh();
      toast.success("Demo workspace restored");
    },
  });

  return (
    <>
      <PageHeader title="Settings" description="AI provider, appearance and workspace data." />
      <div className="grid max-w-4xl gap-5">
        <Panel title="AI provider" description="API keys live in the backend environment and never reach the browser.">
          {isLoading || !s ? (
            <div className="p-5">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <div className={cn("flex items-start gap-3 rounded-lg border p-4", s.ai.mode === "ai" ? "border-brand/25 bg-brand-soft/60" : "border-demo/30 bg-demo-soft/70")}>
                {s.ai.mode === "ai" ? <Sparkles className="mt-0.5 h-5 w-5 text-brand-ink" /> : <FlaskConical className="mt-0.5 h-5 w-5 text-demo" />}
                <div className="flex-1">
                  <div className="text-[14px] font-semibold">{s.ai.mode === "ai" ? "AI mode" : "Demo mode"}</div>
                  <p className="mt-0.5 text-[13px] text-ink-2">
                    {s.ai.mode === "ai"
                      ? `Requirement analysis, test generation and change summaries use ${s.ai.model} at ${s.ai.provider_host}. If a call fails, that batch falls back to the demo engine and is labelled “Demo”.`
                      : "No AI key is configured. A deterministic engine produces analysis and tests from linguistic rules, so results are repeatable and clearly labelled “Demo”."}
                  </p>
                </div>
              </div>
              <dl className="grid gap-4 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-ink-3">Model</dt>
                  <dd className="mt-0.5 font-medium">{s.ai.model ?? "Demo engine"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Endpoint</dt>
                  <dd className="mt-0.5 font-medium">{s.ai.provider_host ?? "Not configured"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Batch size</dt>
                  <dd className="mt-0.5 font-medium">{s.ai.batch_size} requirements per call</dd>
                </div>
              </dl>
              <div>
                <div className="mb-1.5 text-[13px] font-medium">Configure an OpenAI-compatible provider</div>
                <pre className="overflow-x-auto rounded-md border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-2">
{`# backend/.env
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1   # or OpenRouter, Groq, Ollama…
AI_MODEL=gpt-4o-mini`}
                </pre>
                <p className="mt-1.5 text-xs text-ink-3">Restart the backend after changing these values.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => test.mutate()} loading={test.isPending}>
                  {!test.isPending && <PlugZap />} Test connection
                </Button>
                {result && (
                  <span className={cn("inline-flex items-center gap-1.5 text-[13px]", result.ok ? "text-insert" : "text-ink-2")}>
                    {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4 text-redline" />}
                    {result.message}
                    {result.latency_ms !== undefined && ` (${result.latency_ms} ms)`}
                  </span>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Appearance">
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {(
              [
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
                ["system", "Match system", Monitor],
              ] as [Theme, string, typeof Sun][]
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn("flex items-center gap-3 rounded-lg border p-3.5 text-left text-[13.5px] font-medium transition-colors", theme === value ? "border-brand bg-brand-soft/60 text-brand-ink" : "hover:border-ink-3/50")}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Workspace data">
          <div className="flex flex-wrap items-center gap-4 p-5">
            <Database className="h-5 w-5 text-ink-3" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">Database: {s?.database === "postgresql" ? "PostgreSQL" : "SQLite"}</div>
              <p className="text-[13px] text-ink-2">Restore the sample projects (banking, telematics and patient portal) by running their PDFs through the pipeline again.</p>
            </div>
            <Button variant="danger-ghost" onClick={() => setConfirm(true)}>
              <RotateCcw /> Reset demo workspace
            </Button>
          </div>
        </Panel>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset the workspace?"
        description="Every project, document, requirement and test case is deleted, then the sample projects are recreated. This takes a few seconds."
        confirmLabel="Reset workspace"
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
    </>
  );
}
