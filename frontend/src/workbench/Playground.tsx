import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Endpoint, UseCaseCreate } from "../types";
import {
  useAgent, useUseCase, useUpdateUseCase, useCreateUseCase,
  useDiscover, useRunTest, useSaveDiscovery, useDeleteUseCase,
} from "./queries";
import { suggestUseCase } from "./api";
import { btnPrimary, btnSecondary, btnDanger, btnSuccess, btnGhost, btnGhostDanger, inp } from "./ui";

function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.max(48, el.scrollHeight) + "px"; }
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

export default function Playground() {
  const { id: agentId, ucId } = useParams<{ id: string; ucId: string }>();
  const nav = useNavigate();
  const isNew = ucId === "new";

  const { data: agent } = useAgent(agentId!);
  const { data: uc, refetch: refetchUc } = useUseCase(isNew ? "" : ucId!);

  const createUcMut = useCreateUseCase();
  const updateUcMut = useUpdateUseCase();
  const deleteUcMut = useDeleteUseCase();
  const discoverMut = useDiscover();
  const runTestMut = useRunTest();
  const saveDiscMut = useSaveDiscovery();

  // Use case definition fields
  const [ucName, setUcName] = useState("");
  const [ucDesc, setUcDesc] = useState("");
  const [ucTrigger, setUcTrigger] = useState("");
  const [ucInput, setUcInput] = useState("");
  const [ucOutput, setUcOutput] = useState("");
  const [ucFreq, setUcFreq] = useState("");
  const [ucIsWrite, setUcIsWrite] = useState(false);
  const [ucSampleConv, setUcSampleConv] = useState("");
  const [ucDirty, setUcDirty] = useState(false);
  const [ucSaved, setUcSaved] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  // Discovery state
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [behavior, setBehavior] = useState("");
  const [toolDef, setToolDef] = useState("");
  const [discDirty, setDiscDirty] = useState(false);

  // Testing
  const [testInputStr, setTestInputStr] = useState("");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  // Load existing use case into editable fields
  useEffect(() => {
    if (uc) {
      setUcName(uc.name || "");
      setUcDesc(uc.description || "");
      setUcTrigger(uc.trigger_text || "");
      setUcInput(uc.user_input || "");
      setUcOutput(uc.expected_output || "");
      setUcFreq(uc.frequency || "");
      setUcIsWrite(uc.is_write || false);
      setUcSampleConv(uc.sample_conversation || "");
      setUcDirty(false);
      if (uc.discovered_endpoints) setEndpoints(uc.discovered_endpoints);
      if (uc.discovered_behavior) setBehavior(uc.discovered_behavior);
      if (!testInputStr || testInputStr === "{\n  \n}") {
        setTestInputStr(guessTestInput(uc.user_input));
      }
    }
  }, [uc]);

  const setField = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (v: T) => {
    setter(v);
    setUcDirty(true);
  };

  // --- AI Discovery ---

  const handleAiSuggest = async () => {
    if (!agentId || !ucName.trim() || !ucDesc.trim()) return;
    setAiSuggesting(true);
    try {
      const suggestion = await suggestUseCase(agentId, ucName, ucDesc);
      if (suggestion.error) {
        alert("AI suggestion failed: " + suggestion.error);
      } else {
        if (suggestion.trigger_text) { setUcTrigger(suggestion.trigger_text); }
        if (suggestion.user_input) { setUcInput(suggestion.user_input); }
        if (suggestion.expected_output) { setUcOutput(suggestion.expected_output); }
        if (suggestion.frequency) { setUcFreq(suggestion.frequency); }
        if (suggestion.is_write !== undefined) { setUcIsWrite(suggestion.is_write); }
        if (suggestion.sample_conversation) { setUcSampleConv(suggestion.sample_conversation); }
        setUcDirty(true);
      }
    } catch (e: unknown) {
      alert("AI suggestion failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setAiSuggesting(false);
    }
  };

  // --- Save ---

  const buildData = (): UseCaseCreate => ({
    name: ucName, description: ucDesc, trigger_text: ucTrigger,
    user_input: ucInput, expected_output: ucOutput, frequency: ucFreq,
    is_write: ucIsWrite, sample_conversation: ucSampleConv,
  });

  const handleSaveUseCase = async () => {
    if (isNew) {
      if (!ucName.trim()) { alert("Name is required"); return; }
      try {
        const created = await createUcMut.mutateAsync({ agentId: agentId!, data: buildData() });
        nav(`/workbench/agents/${agentId}/usecases/${created.id}`, { replace: true });
      } catch (e: unknown) {
        alert("Create failed: " + (e instanceof Error ? e.message : "Unknown error"));
      }
    } else {
      try {
        await updateUcMut.mutateAsync({ id: ucId!, data: buildData() });
        setUcDirty(false);
        setUcSaved(true);
        setTimeout(() => setUcSaved(false), 2000);
        refetchUc();
      } catch (e: unknown) {
        alert("Save failed: " + (e instanceof Error ? e.message : "Unknown error"));
      }
    }
  };

  // --- Discovery & Test handlers ---

  const handleDiscover = async () => {
    try {
      const result = await discoverMut.mutateAsync({ agentId: agentId!, useCaseId: ucId! });
      setEndpoints(result.endpoints || []);
      setBehavior(result.behavior || "");
      setToolDef(result.tool_definition ? JSON.stringify(result.tool_definition, null, 2) : "");
      setDiscDirty(true);
      refetchUc();
    } catch (e: unknown) {
      alert("Discovery failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleSaveDiscovery = async () => {
    try {
      await saveDiscMut.mutateAsync({ useCaseId: ucId!, data: { endpoints, behavior } });
      setDiscDirty(false);
      refetchUc();
    } catch (e: unknown) {
      alert("Save failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const updateEndpoint = (idx: number, field: string, value: string) => {
    const updated = [...endpoints];
    updated[idx] = { ...updated[idx], [field]: value };
    setEndpoints(updated);
    setDiscDirty(true);
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

  if (!agent || (!isNew && !uc)) return <p className="text-sm text-gray-500">Loading...</p>;

  const testSteps = (testResult?.steps as Array<Record<string, unknown>>) || [];
  const status = isNew ? "new" : uc?.status || "draft";
  const canAiSuggest = ucName.trim().length > 0 && ucDesc.trim().length > 0;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{isNew ? "New Use Case" : ucName || "Use Case"}</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">{status}</span>
        </div>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={handleSaveUseCase} disabled={isNew ? createUcMut.isPending || !ucName.trim() : !ucDirty}>
            {ucSaved ? "Saved!" : isNew ? (createUcMut.isPending ? "Creating..." : "Create & Save") : "Save"}
          </button>
          {!isNew && (
            <button className={btnDanger} onClick={async () => { if (confirm("Delete this use case?")) { await deleteUcMut.mutateAsync(ucId!); nav(`/workbench/agents/${agentId}`); } }}>
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.3fr] gap-5">
        {/* Left — Use Case Definition (editable) */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <h3 className="font-semibold text-text-primary text-sm">Use Case Definition</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input className={inp} value={ucName} onChange={(e) => setField(setUcName)(e.target.value)} placeholder="e.g. Browse products by category" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input className={inp} value={ucDesc} onChange={(e) => setField(setUcDesc)(e.target.value)} placeholder="Short summary of what this use case does" />
            </div>

            {/* AI Discovery button */}
            <button
              className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                canAiSuggest && !aiSuggesting
                  ? "bg-tedee-navy text-white hover:bg-tedee-navy/90"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
              onClick={handleAiSuggest}
              disabled={!canAiSuggest || aiSuggesting}
            >
              {aiSuggesting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  AI is analyzing...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  AI Discovery
                </>
              )}
            </button>
            {!canAiSuggest && (
              <p className="text-[11px] text-gray-400 -mt-1">Fill in Name and Description to enable AI Discovery</p>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Trigger</label>
              <AutoTextarea className={inp} value={ucTrigger} onChange={setField(setUcTrigger)} placeholder="What question or event triggers this?" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">User Provides</label>
              <AutoTextarea className={inp} value={ucInput} onChange={setField(setUcInput)} placeholder="What information does the user/agent provide?" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expected Output</label>
              <AutoTextarea className={inp} value={ucOutput} onChange={setField(setUcOutput)} placeholder="What should the response contain?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                <input className={inp} value={ucFreq} onChange={(e) => setField(setUcFreq)(e.target.value)} placeholder="~200/day" />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={ucIsWrite} onChange={(e) => setField(setUcIsWrite)(e.target.checked)} />
                  Write operation
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sample Conversation</label>
              <AutoTextarea
                className={`${inp} font-mono text-xs`}
                value={ucSampleConv}
                onChange={setField(setUcSampleConv)}
                placeholder={"User: Where is my order ORD-001?\nAgent: Your order ORD-001 is currently in transit...\nUser: When will it arrive?\nAgent: The estimated delivery is March 30."}
              />
            </div>
          </div>

          {/* Test History */}
          {!isNew && uc?.test_results && uc.test_results.length > 0 && (
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

        {/* Right — Discovery & Testing */}
        <div className="space-y-4">
          {isNew ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <p className="text-sm text-gray-500 mb-2">Save the use case first to unlock endpoint discovery and live testing.</p>
              <p className="text-xs text-gray-400">Fill in the definition on the left, then click "Create & Save".</p>
            </div>
          ) : (
            <>
              {/* Discovery */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-text-primary text-sm">Self-Discovery</h3>
                  <div className="flex gap-2">
                    <button className={btnSuccess} onClick={handleSaveDiscovery} disabled={!discDirty || saveDiscMut.isPending}>
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
                      <button className={btnGhost} onClick={() => { setEndpoints([...endpoints, { method: "GET", path: "/", purpose: "", parameters: {}, extracts: [] }]); setDiscDirty(true); }}>
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
                          <button className="text-xs text-red-500 hover:text-red-700 px-1" onClick={() => { setEndpoints(endpoints.filter((_, j) => j !== i)); setDiscDirty(true); }}>X</button>
                        </div>
                        <input className="w-full rounded border border-gray-200 px-2 py-1 text-xs" value={ep.purpose || ""} placeholder="Purpose" onChange={(e) => updateEndpoint(i, "purpose", e.target.value)} />
                      </div>
                    ))}

                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Agent Behavior</h4>
                      <AutoTextarea className={inp} value={behavior} onChange={(v) => { setBehavior(v); setDiscDirty(true); }} placeholder="Describe how the agent chains these calls..." />
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
                {!uc?.discovered_endpoints && endpoints.length === 0 ? (
                  <p className="text-xs text-gray-400">Run discovery first to map endpoints, then you can test.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Test Input (JSON)</label>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
