import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Endpoint, UseCaseCreate } from "../types";
import { useAgent, useUseCase, useDiscover, useRunTest, useSaveDiscovery, useDeleteUseCase, useCreateUseCase } from "./queries";
import { btnPrimary, btnSecondary, btnDanger, btnSuccess, btnGhost, btnGhostDanger, inp } from "./ui";

function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.max(60, el.scrollHeight) + "px"; }
  }, []);
  useEffect(() => { resize(); }, [value, resize]);
  return (
    <textarea ref={ref} className={className} value={value}
      onChange={(e) => onChange(e.target.value)} onInput={resize}
      placeholder={placeholder} rows={1} style={{ overflow: "hidden", resize: "none" }} />
  );
}

function guessTestInput(userInput?: string): string {
  if (!userInput) return "{\n  \n}";
  const lower = userInput.toLowerCase();
  const obj: Record<string, unknown> = {};
  if (lower.includes("product id")) obj.id = 5;
  else if (lower.includes("cart") || lower.includes("order id")) obj.id = 1;
  else if (lower.includes("customer id") || lower.includes("user id")) obj.id = 1;
  else if (lower.includes("search") || lower.includes("keyword")) obj.q = "laptop";
  else if (lower.includes("category")) obj.category = "smartphones";
  else if (lower.includes("name")) obj.q = "Emily";
  else if (lower.includes("id")) obj.id = 1;
  if (Object.keys(obj).length === 0) obj.q = "test";
  return JSON.stringify(obj, null, 2);
}

const EMPTY_UC: UseCaseCreate = {
  name: "", description: "", trigger_text: "", user_input: "",
  expected_output: "", frequency: "", is_write: false, priority: "medium",
};

function NewUseCaseForm({ agentId }: { agentId: string }) {
  const nav = useNavigate();
  const createUc = useCreateUseCase();
  const [form, setForm] = useState<UseCaseCreate>({ ...EMPTY_UC });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const uc = await createUc.mutateAsync({ agentId, data: form });
      nav(`/workbench/agents/${agentId}/usecases/${uc.id}`, { replace: true });
    } catch (err: unknown) {
      alert("Failed to create: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <h2 className="text-xl font-bold text-text-primary">New Use Case</h2>
      </div>
      <form className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Use Case Name *</label>
          <input className={inp} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Browse products by category" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <input className={inp} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short summary of what this use case does" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Trigger</label>
          <textarea className={inp} rows={2} value={form.trigger_text} onChange={(e) => setForm({ ...form, trigger_text: e.target.value })} placeholder="What question or event triggers this? e.g. 'Customer asks to see laptops'" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">User Provides</label>
          <textarea className={inp} rows={2} value={form.user_input} onChange={(e) => setForm({ ...form, user_input: e.target.value })} placeholder="What information does the user/agent provide? e.g. 'Category name or product ID'" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Expected Output</label>
          <textarea className={inp} rows={2} value={form.expected_output} onChange={(e) => setForm({ ...form, expected_output: e.target.value })} placeholder="What should the response contain? e.g. 'List of products with name, price, image'" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Frequency</label>
            <input className={inp} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="e.g. ~200/day" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priority</label>
            <select className={inp} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={form.is_write} onChange={(e) => setForm({ ...form, is_write: e.target.checked })} />
              Write operation
            </label>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" className={btnPrimary} disabled={createUc.isPending || !form.name.trim()}>
            {createUc.isPending ? "Creating..." : "Create Use Case"}
          </button>
          <button type="button" className={btnSecondary} onClick={() => nav(`/workbench/agents/${agentId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function Playground() {
  const { id: agentId, ucId } = useParams<{ id: string; ucId: string }>();
  const nav = useNavigate();
  const isNew = ucId === "new";
  const { data: agent } = useAgent(agentId!);
  const { data: uc, refetch: refetchUc } = useUseCase(isNew ? "" : ucId!);

  const discoverMut = useDiscover();
  const runTestMut = useRunTest();
  const saveDiscMut = useSaveDiscovery();
  const deleteUcMut = useDeleteUseCase();

  // If creating a new use case, show the form
  if (isNew) {
    if (!agent) return <p className="text-sm text-gray-500">Loading...</p>;
    return <NewUseCaseForm agentId={agentId!} />;
  }

  // Editable discovery state
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [behavior, setBehavior] = useState("");
  const [toolDef, setToolDef] = useState("");
  const [dirty, setDirty] = useState(false);

  // Testing
  const [testInputStr, setTestInputStr] = useState("");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  // Sync from loaded use case
  useEffect(() => {
    if (uc) {
      if (uc.discovered_endpoints) setEndpoints(uc.discovered_endpoints);
      if (uc.discovered_behavior) setBehavior(uc.discovered_behavior);
      if (!testInputStr || testInputStr === "{\n  \n}") {
        setTestInputStr(guessTestInput(uc.user_input));
      }
    }
  }, [uc]);

  const handleDiscover = async () => {
    try {
      const result = await discoverMut.mutateAsync({ agentId: agentId!, useCaseId: ucId! });
      setEndpoints(result.endpoints || []);
      setBehavior(result.behavior || "");
      setToolDef(result.tool_definition ? JSON.stringify(result.tool_definition, null, 2) : "");
      setDirty(true);
      refetchUc();
    } catch (e: unknown) {
      alert("Discovery failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleSaveDiscovery = async () => {
    try {
      await saveDiscMut.mutateAsync({ useCaseId: ucId!, data: { endpoints, behavior } });
      setDirty(false);
      refetchUc();
    } catch (e: unknown) {
      alert("Save failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const updateEndpoint = (idx: number, field: string, value: string) => {
    const updated = [...endpoints];
    updated[idx] = { ...updated[idx], [field]: value };
    setEndpoints(updated);
    setDirty(true);
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const input = JSON.parse(testInputStr);
      const result = await runTestMut.mutateAsync({ agentId: agentId!, useCaseId: ucId!, testInput: input });
      setTestResult(result as unknown as Record<string, unknown>);
      refetchUc();
    } catch (e: unknown) {
      alert("Test failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  // (styles imported from ./ui)

  if (!agent || !uc) return <p className="text-sm text-gray-500">Loading...</p>;

  const testSteps = (testResult?.steps as Array<Record<string, unknown>>) || [];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{uc.name}</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">{uc.status}</span>
        </div>
        <button
          className={btnDanger}
          onClick={async () => { if (confirm("Delete this use case?")) { await deleteUcMut.mutateAsync(ucId!); nav(`/workbench/agents/${agentId}`); } }}
        >
          Delete Use Case
        </button>
      </div>

      <div className="grid grid-cols-[1fr_1.3fr] gap-5">
        {/* Left — Use Case Definition */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-text-primary text-sm mb-3">Use Case Definition</h3>
            {[
              { label: "Trigger", value: uc.trigger_text },
              { label: "User Provides", value: uc.user_input },
              { label: "Expected Output", value: uc.expected_output },
            ].map((f) => (
              <div key={f.label} className="mb-3">
                <label className="block text-xs text-gray-400 mb-0.5">{f.label}</label>
                <p className="text-sm text-text-primary">{f.value || "\u2014"}</p>
              </div>
            ))}
            <div className="flex gap-4 text-xs text-gray-500">
              <span>Frequency: {uc.frequency || "\u2014"}</span>
              <span className={`px-1.5 py-0.5 rounded font-medium ${uc.priority === "high" ? "bg-red-100 text-red-700" : uc.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                {uc.priority}
              </span>
              <span>{uc.is_write ? "Read + Write" : "Read only"}</span>
            </div>
          </div>

          {/* Test History */}
          {uc.test_results && uc.test_results.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-text-primary text-sm mb-3">Test History ({uc.test_results.length})</h3>
              {uc.test_results.slice(-5).reverse().map((tr, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{tr.timestamp ? new Date(tr.timestamp).toLocaleString() : "\u2014"}</span>
                  <span className={tr.steps?.every((s) => s.success) ? "text-green-600" : "text-red-600"}>
                    {tr.steps?.every((s) => s.success) ? "Pass" : "Fail"}
                  </span>
                  <span className="text-gray-400">{tr.total_latency_ms}ms</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Playground */}
        <div className="space-y-4">
          {/* Discovery */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary text-sm">Self-Discovery</h3>
              <div className="flex gap-2">
                <button
                  className={btnSuccess}
                  onClick={handleSaveDiscovery}
                  disabled={!dirty || saveDiscMut.isPending}
                >
                  {saveDiscMut.isPending ? "Saving..." : "Save Changes"}
                </button>
                {!agent.has_api_spec ? (
                  <span className="text-xs text-amber-600">Upload API spec first</span>
                ) : (
                  <button className={btnPrimary} onClick={handleDiscover} disabled={discoverMut.isPending}>
                    {discoverMut.isPending ? "Analyzing..." : endpoints.length ? "Re-run Discovery" : "Run Discovery"}
                  </button>
                )}
              </div>
            </div>

            {endpoints.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mapped Endpoints</h4>
                  <button className={btnGhost} onClick={() => { setEndpoints([...endpoints, { method: "GET", path: "/", purpose: "", parameters: {}, extracts: [] }]); setDirty(true); }}>
                    + Add Endpoint
                  </button>
                </div>
                {endpoints.map((ep, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex gap-2 mb-2">
                      <select className="rounded border border-gray-200 px-2 py-1 text-xs w-20" value={ep.method || "GET"} onChange={(e) => updateEndpoint(i, "method", e.target.value)}>
                        <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
                      </select>
                      <input className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs font-mono" value={ep.path || ""} placeholder="/path/{param}" onChange={(e) => updateEndpoint(i, "path", e.target.value)} />
                      <button className="text-xs text-red-500 hover:text-red-700 px-1" onClick={() => { setEndpoints(endpoints.filter((_, j) => j !== i)); setDirty(true); }}>X</button>
                    </div>
                    <input className="w-full rounded border border-gray-200 px-2 py-1 text-xs" value={ep.purpose || ""} placeholder="Purpose — why is this call needed?" onChange={(e) => updateEndpoint(i, "purpose", e.target.value)} />
                  </div>
                ))}

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Agent Behavior</h4>
                  <AutoTextarea className={inp} value={behavior} onChange={(v) => { setBehavior(v); setDirty(true); }} placeholder="Describe how the agent chains these calls..." />
                </div>

                {toolDef && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Generated Tool Definition</h4>
                    <textarea className={`${inp} font-mono text-xs`} rows={8} value={toolDef} onChange={(e) => setToolDef(e.target.value)} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Test */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-text-primary text-sm mb-3">Live Test</h3>
            {!uc.discovered_endpoints && endpoints.length === 0 ? (
              <p className="text-xs text-gray-400">Run discovery first to map endpoints, then you can test.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Test Input (JSON) &mdash; based on &ldquo;{uc.user_input}&rdquo;</label>
                  <textarea className={`${inp} font-mono text-xs`} rows={4} value={testInputStr} onChange={(e) => setTestInputStr(e.target.value)} />
                </div>
                <button className={btnPrimary} onClick={handleTest} disabled={runTestMut.isPending}>
                  {runTestMut.isPending ? "Running test..." : "Run Test"}
                </button>

                {testResult && (
                  <div className="space-y-2 mt-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Test Steps</h4>
                    {testSteps.map((step, i) => (
                      <div key={i} className={`rounded-lg p-3 border-l-4 ${step.success ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <code className="font-mono font-medium">{String(step.endpoint)}</code>
                          <span className={step.success ? "text-green-600" : "text-red-600"}>
                            {String(step.status_code)} ({String(step.latency_ms)}ms)
                          </span>
                        </div>
                        <pre className="text-[10px] font-mono bg-white/60 rounded p-2 overflow-x-auto max-h-24">
                          {JSON.stringify(step.response, null, 2)}
                        </pre>
                      </div>
                    ))}

                    {!!testResult.agent_response && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Agent Would Answer</h4>
                        <div className="bg-tedee-cyan/10 rounded-lg p-3 text-sm text-text-primary leading-relaxed">
                          {String(testResult.agent_response)}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-400">Total latency: {String(testResult.total_latency_ms)}ms</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
