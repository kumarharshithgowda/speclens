import { Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/overlay";
import { CrumbProvider, ScopeProvider, ThemeProvider, useTheme } from "@/context/app";
import ChangeAnalysis from "@/pages/ChangeAnalysis";
import Dashboard from "@/pages/Dashboard";
import DocumentDetail from "@/pages/DocumentDetail";
import Documents from "@/pages/Documents";
import NotFound from "@/pages/NotFound";
import ProjectDetail from "@/pages/ProjectDetail";
import Projects from "@/pages/Projects";
import Reports from "@/pages/Reports";
import Requirements from "@/pages/Requirements";
import Settings from "@/pages/Settings";
import TestCases from "@/pages/TestCases";
import Traceability from "@/pages/Traceability";

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{ classNames: { toast: "!font-sans !text-[13px] !border-line !rounded-lg" } }}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ScopeProvider>
          <CrumbProvider>
            <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/documents/:id" element={<DocumentDetail />} />
                <Route path="/requirements" element={<Requirements />} />
                <Route path="/changes" element={<ChangeAnalysis />} />
                <Route path="/test-cases" element={<TestCases />} />
                <Route path="/traceability" element={<Traceability />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
            <ThemedToaster />
          </CrumbProvider>
        </ScopeProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
