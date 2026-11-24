import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useRefreshAll } from "@/lib/hooks";
import type { TestCase } from "@/lib/types";
import { LEVELS, TEST_TYPE_LABEL, TEST_TYPES } from "@/lib/utils";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export function TestCaseDialog({
  open,
  onOpenChange,
  test,
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  test?: TestCase | null;
  projectId?: number;
}) {
  const refresh = useRefreshAll();
  const [requirementId, setRequirementId] = useState("");
  const [criterionId, setCriterionId] = useState("");
  const [title, setTitle] = useState("");
  const [scenario, setScenario] = useState("");
  const [pre, setPre] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [type, setType] = useState("positive");
  const [priority, setPriority] = useState("Medium");
  const [status, setStatus] = useState("draft");
  const [data, setData] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: reqs = [] } = useQuery({
    queryKey: ["requirements", { projectId, picker: true }],
    queryFn: () => api.requirements({ project_id: projectId }),
    enabled: open && !test,
  });
  const reqForCriteria = test ? test.requirement_id : Number(requirementId);
  const { data: req } = useQuery({
    queryKey: ["requirement", reqForCriteria],
    queryFn: () => api.requirement(reqForCriteria),
    enabled: open && reqForCriteria > 0,
  });

  useEffect(() => {
    if (!open) return;
    setRequirementId(test ? String(test.requirement_id) : "");
    setCriterionId(test?.criterion_id ? String(test.criterion_id) : "");
    setTitle(test?.title ?? "");
    setScenario(test?.scenario ?? "");
    setPre(test?.preconditions.join("\n") ?? "");
    setSteps(test?.steps.join("\n") ?? "");
    setExpected(test?.expected_result ?? "");
    setType(test?.test_type ?? "positive");
    setPriority(test?.priority ?? "Medium");
    setStatus(test?.status ?? "draft");
    setData(test?.test_data ?? "");
    setError(null);
  }, [open, test]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        criterion_id: criterionId ? Number(criterionId) : null,
        title: title.trim(),
        scenario,
        preconditions: lines(pre),
        steps: lines(steps),
        expected_result: expected,
        test_type: type,
        priority,
        status,
        test_data: data,
      } as Partial<TestCase>;
      return test ? api.updateTest(test.id, body) : api.createTest({ ...body, requirement_id: Number(requirementId) });
    },
    onSuccess: (t) => {
      refresh();
      toast.success(test ? `${t.code} saved` : `${t.code} created`);
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!test && !requirementId) return setError("Choose the requirement this test verifies.");
    if (title.trim().length < 3) return setError("Enter a title of at least 3 characters.");
    if (lines(steps).length === 0) return setError("Add at least one test step.");
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title={test ? `Edit ${test.code}` : "New test case"}
        description={test ? `Verifies ${test.requirement_code} — ${test.requirement_title}` : "Manually authored tests are labelled “Manual”."}
      >
        <form onSubmit={submit} className="space-y-4">
          {error && <p className="rounded-md border border-redline/30 bg-redline-soft px-3 py-2 text-[13px] text-redline">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {!test && (
              <Field label="Requirement">
                <Select
                  value={requirementId}
                  onChange={(v) => {
                    setRequirementId(v);
                    setCriterionId("");
                  }}
                  placeholder="Choose a requirement"
                  options={reqs.map((r) => ({ value: String(r.id), label: `${r.code} · ${r.title}` }))}
                  className="w-full"
                />
              </Field>
            )}
            <Field label="Acceptance criterion" hint="Links the test into the traceability matrix.">
              <Select
                value={criterionId}
                onChange={setCriterionId}
                allLabel="Not linked to a criterion"
                options={(req?.criteria ?? []).map((c) => ({ value: String(c.id), label: `${c.code} — ${c.text.slice(0, 60)}…` }))}
                className="w-full"
              />
            </Field>
          </div>
          <Field label="Title">
            <Input value={title} maxLength={250} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Scenario">
            <Textarea value={scenario} maxLength={2000} className="min-h-[60px]" onChange={(e) => setScenario(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preconditions" hint="One per line.">
              <Textarea value={pre} className="min-h-[110px]" onChange={(e) => setPre(e.target.value)} />
            </Field>
            <Field label="Test steps" hint="One step per line, in order.">
              <Textarea value={steps} className="min-h-[110px]" onChange={(e) => setSteps(e.target.value)} />
            </Field>
          </div>
          <Field label="Expected result">
            <Textarea value={expected} maxLength={2000} className="min-h-[60px]" onChange={(e) => setExpected(e.target.value)} />
          </Field>
          <Field label="Test data">
            <Input value={data} maxLength={2000} onChange={(e) => setData(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type">
              <Select value={type} onChange={setType} options={TEST_TYPES.map((t) => ({ value: t, label: TEST_TYPE_LABEL[t] }))} className="w-full" />
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={setPriority} options={LEVELS.map((l) => ({ value: l, label: l }))} className="w-full" />
            </Field>
            <Field label="Status">
              <Select
                value={status}
                onChange={setStatus}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "ready", label: "Ready" },
                  { value: "needs_review", label: "Needs review" },
                  { value: "obsolete", label: "Obsolete" },
                ]}
                className="w-full"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {test ? "Save test case" : "Create test case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
