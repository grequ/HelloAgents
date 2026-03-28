import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { UseCaseCreate, UseCase, System, SpecConfig, AgentConfig, InteractionAsk, InteractionProvides } from "../types";
import {
  useSystem, useSystems, useUseCases, useInteractions,
  useCreateUseCase, useDeleteUseCase, useDeleteSystem,
  useSetApiKey, useUploadSpec, useTestConnection, useGenerateSpec,
  useSaveAgentConfig, useSaveInteractions,
} from "./queries";
import { listUseCases } from "./api";

const EMPTY_UC: UseCaseCreate = {
  name: "", description: "", trigger_text: "", user_input: "",
  expected_output: "", frequency: "", is_write: false, priority: "medium",
};

// --- Auto-sizing textarea ---

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

// --- Generators ---

function generateAdditionalContext(sys: System, ucs: UseCase[]): string {
  const lines: string[] = [];
  if (sys.api_base_url) lines.push(`API Base URL: ${sys.api_base_url}`);
  if (sys.api_auth_type && sys.api_auth_type !== "none") lines.push(`Authentication: ${sys.api_auth_type}`);
  if (sys.has_api_spec) lines.push(`OpenAPI spec loaded with ${sys.api_spec_endpoint_count ?? "unknown number of"} endpoints.`);
  if (sys.api_docs_url) lines.push(`API docs: ${sys.api_docs_url}`);
  const tested = ucs.filter((u) => u.status === "tested");
  const discovered = ucs.filter((u) => u.status === "discovered" || u.status === "tested");
  if (tested.length > 0) lines.push(`\n${tested.length} of ${ucs.length} use cases have been live-tested.`);
  if (discovered.length > tested.length) lines.push(`${discovered.length - tested.length} additional use cases have discovered endpoints but are untested.`);
  const writes = ucs.filter((u) => u.is_write);
  if (writes.length > 0) lines.push(`\nWrite operations (${writes.map((u) => u.name).join(", ")}): require user confirmation.`);
  const highFreq = ucs.filter((u) => u.frequency);
  if (highFreq.length > 0) lines.push(`\nExpected traffic: ${highFreq.map((u) => `${u.name} (${u.frequency})`).join(", ")}.`);
  const allEps = ucs.flatMap((u) => u.discovered_endpoints || []);
  if (allEps.length > 0) {
    const methods = [...new Set(allEps.map((e) => e.method))];
    const paths = [...new Set(allEps.map((e) => e.path))];
    lines.push(`\nDiscovered ${allEps.length} endpoint calls across ${paths.length} unique paths (methods: ${methods.join(", ")}).`);
  }
  return lines.join("\n");
}

function generateRoleFromUseCases(sys: System, ucs: UseCase[]): string {
  const domain = sys.category || "general";
  const readUcs = ucs.filter((u) => !u.is_write);
  const writeUcs = ucs.filter((u) => u.is_write);
  const highPri = ucs.filter((u) => u.priority === "high");
  let role = `You are the ${sys.name} Agent, a specialized AI assistant responsible for the ${domain} domain. `;
  role += `You have access to the ${sys.name} system via its ${sys.api_type?.toUpperCase() || "REST"} API. `;
  if (readUcs.length > 0) role += `\n\nYour primary read operations include: ${readUcs.map((u) => u.name.toLowerCase()).join(", ")}. `;
  if (writeUcs.length > 0) role += `Your write operations include: ${writeUcs.map((u) => u.name.toLowerCase()).join(", ")}. Write operations require explicit user confirmation. `;
  role += `\n\nBehavior guidelines:\n- Always use ONLY data from tool results. Never fabricate information.\n- Be concise and factual.\n- If a tool call fails, explain what happened and suggest alternatives.\n- If the request is outside your domain, say so clearly.\n`;
  if (highPri.length > 0) role += `- Prioritize: ${highPri.map((u) => u.name).join(", ")}.\n`;
  role += `- For write operations, confirm with the user before proceeding.\n- Never expose internal IDs, API keys, or technical details.`;
  return role;
}

// --- Shared styles ---
const btn = "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnSz = "px-4 py-2";
const btnPrimary = `${btn} ${btnSz} bg-tedee-cyan text-tedee-navy hover:bg-hover-cyan`;
const btnSecondary = `${btn} ${btnSz} border border-gray-200 text-gray-600 hover:bg-gray-50`;
const btnDanger = `${btn} ${btnSz} bg-red-500 text-white hover:bg-red-600`;
const btnGhost = "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors";
const btnGhostDefault = `${btnGhost} bg-gray-100 text-gray-700 hover:bg-gray-200`;
const btnGhostDanger = `${btnGhost} text-red-600 hover:bg-red-50`;
const inp = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan focus:ring-1 focus:ring-tedee-cyan/20";

// --- Component ---

export default function SystemDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: system, isLoading: sysLoading } = useSystem(id!);
  const { data: useCases = [], isLoading: ucLoading } = useUseCases(id!);
  const { data: allSystemsList = [] } = useSystems();
  const { data: interactions } = useInteractions(id!);

  const createUc = useCreateUseCase();
  const deleteUc = useDeleteUseCase();
  const deleteSys = useDeleteSystem();
  const setApiKey = useSetApiKey();
  const uploadSpec = useUploadSpec();
  const testConn = useTestConnection();
  const genSpec = useGenerateSpec();
  const saveConfig = useSaveAgentConfig();
  const saveInteractionsMut = useSaveInteractions();

  const allSystems = allSystemsList.filter((s) => s.id !== id);

  // Forms
  const [showUcForm, setShowUcForm] = useState(false);
  const [ucForm, setUcForm] = useState<UseCaseCreate>({ ...EMPTY_UC });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [specInput, setSpecInput] = useState("");
  const [saved, setSaved] = useState(false);

  // Config state
  const [genConfig, setGenConfig] = useState({
    agent_name: "", tech_stack: "Python 3.11", framework: "FastAPI + anthropic SDK",
    agent_role: "", deployment: "Standalone microservice (Docker)",
    error_handling: "Retry once on 5xx, return graceful error message to user on failure",
    auth_notes: "", additional_context: "",
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Interactions state (loaded from DB)
  const [asksAgents, setAsksAgents] = useState<InteractionAsk[]>([]);
  const [providesToAgents, setProvidesToAgents] = useState<InteractionProvides[]>([]);
  const [interactionsLoaded, setInteractionsLoaded] = useState(false);
  const [allUseCasesBySystem, setAllUseCasesBySystem] = useState<Record<string, UseCase[]>>({});

  // Load use cases for other systems
  useEffect(() => {
    async function loadOtherUcs() {
      const ucMap: Record<string, UseCase[]> = {};
      for (const sys of allSystems) {
        try { ucMap[sys.id] = await listUseCases(sys.id); } catch { ucMap[sys.id] = []; }
      }
      setAllUseCasesBySystem(ucMap);
    }
    if (allSystems.length > 0) loadOtherUcs();
  }, [allSystemsList.length]);

  // Load config from DB or generate defaults
  useEffect(() => {
    if (!system || configLoaded) return;
    const c = system.agent_config;
    if (c) {
      setGenConfig({
        agent_name: c.agent_name || system.name + " Agent",
        tech_stack: c.tech_stack || "Python 3.11",
        framework: c.framework || "FastAPI + anthropic SDK",
        agent_role: c.agent_role || "",
        deployment: c.deployment || "Standalone microservice (Docker)",
        error_handling: c.error_handling || "Retry once on 5xx, return graceful error message to user on failure",
        auth_notes: c.auth_notes || "",
        additional_context: c.additional_context || "",
      });
      setConfigLoaded(true);
    } else if (useCases.length > 0) {
      setGenConfig((prev) => ({
        ...prev,
        agent_name: prev.agent_name || system.name + " Agent",
        agent_role: prev.agent_role || generateRoleFromUseCases(system, useCases),
        auth_notes: prev.auth_notes || (system.api_auth_type && system.api_auth_type !== "none" ? `${system.api_auth_type} — API key from env var` : ""),
        additional_context: prev.additional_context || generateAdditionalContext(system, useCases),
      }));
      setConfigLoaded(true);
    }
  }, [system, useCases, configLoaded]);

  // Load interactions from DB
  useEffect(() => {
    if (!interactions || interactionsLoaded) return;
    setAsksAgents(interactions.asks.map((a) => ({
      target_system_id: a.target_system_id,
      target_system_name: a.target_system_name,
      use_case_ids: a.use_case_ids,
    })));
    setProvidesToAgents(interactions.provides_to.map((p) => ({
      source_system_id: p.source_system_id,
      source_system_name: p.source_system_name,
      use_case_ids: p.use_case_ids,
    })));
    setInteractionsLoaded(true);
  }, [interactions, interactionsLoaded]);

  // --- Save all ---

  const handleSave = async () => {
    const config: AgentConfig = { ...genConfig, };
    // Save config
    await saveConfig.mutateAsync({ id: id!, config });
    // Save interactions
    await saveInteractionsMut.mutateAsync({
      systemId: id!,
      asks: asksAgents.map((a) => ({ target_system_id: a.target_system_id, use_case_ids: a.use_case_ids })),
      provides_to: providesToAgents.map((p) => ({ source_system_id: p.source_system_id, use_case_ids: p.use_case_ids })),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isSaving = saveConfig.isPending || saveInteractionsMut.isPending;

  // --- Other handlers ---

  const handleCreateUc = async (e: React.FormEvent) => {
    e.preventDefault();
    await createUc.mutateAsync({ systemId: id!, data: ucForm });
    setUcForm({ ...EMPTY_UC });
    setShowUcForm(false);
  };

  const handleUploadSpec = async () => {
    try {
      const spec = JSON.parse(specInput);
      await uploadSpec.mutateAsync({ id: id!, spec });
      setSpecInput("");
    } catch { alert("Invalid JSON"); }
  };

  const handleGenerate = async () => {
    // Save first
    await handleSave();

    const interactionLines: string[] = [];
    for (const a of asksAgents) {
      const ucNames = a.use_case_ids.map((uid) => (allUseCasesBySystem[a.target_system_id] || []).find((u) => u.id === uid)?.name).filter(Boolean);
      interactionLines.push(`This agent calls: ${a.target_system_name} Agent` + (ucNames.length ? ` (use cases: ${ucNames.join(", ")})` : ""));
    }
    for (const p of providesToAgents) {
      const ucNames = p.use_case_ids.map((uid) => (allUseCasesBySystem[p.source_system_id] || []).find((u) => u.id === uid)?.name).filter(Boolean);
      interactionLines.push(`This agent is called by: ${p.source_system_name} Agent` + (ucNames.length ? ` (use cases: ${ucNames.join(", ")})` : ""));
    }

    const config: SpecConfig = {
      ...genConfig, interactions: interactionLines.join("\n") || "",
    };
    try {
      const spec = await genSpec.mutateAsync({
        agentName: genConfig.agent_name || system!.name + " Agent",
        systemIds: [id!], useCaseIds: useCases.map((u) => u.id), config,
      });
      nav(`/workbench/agents/${spec.id}`);
    } catch (e: unknown) {
      alert("Generation failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  // --- Interaction helpers ---

  function addAsk() {
    const used = asksAgents.map((a) => a.target_system_id);
    const available = allSystems.filter((s) => !used.includes(s.id));
    if (available.length === 0) return;
    setAsksAgents([...asksAgents, { target_system_id: available[0].id, target_system_name: available[0].name, use_case_ids: [] }]);
  }

  function addProvidesTo() {
    const used = providesToAgents.map((p) => p.source_system_id);
    const available = allSystems.filter((s) => !used.includes(s.id));
    if (available.length === 0) return;
    setProvidesToAgents([...providesToAgents, { source_system_id: available[0].id, source_system_name: available[0].name, use_case_ids: [] }]);
  }

  function updateAsk(idx: number, systemId: string) {
    const updated = [...asksAgents];
    updated[idx] = { target_system_id: systemId, target_system_name: allSystems.find((s) => s.id === systemId)?.name || "", use_case_ids: [] };
    setAsksAgents(updated);
  }

  function updateProvides(idx: number, systemId: string) {
    const updated = [...providesToAgents];
    updated[idx] = { source_system_id: systemId, source_system_name: allSystems.find((s) => s.id === systemId)?.name || "", use_case_ids: [] };
    setProvidesToAgents(updated);
  }

  function toggleAskUc(idx: number, ucId: string) {
    const updated = [...asksAgents];
    const ucs = updated[idx].use_case_ids;
    updated[idx] = { ...updated[idx], use_case_ids: ucs.includes(ucId) ? ucs.filter((x) => x !== ucId) : [...ucs, ucId] };
    setAsksAgents(updated);
  }

  function toggleProvidesUc(idx: number, ucId: string) {
    const updated = [...providesToAgents];
    const ucs = updated[idx].use_case_ids;
    updated[idx] = { ...updated[idx], use_case_ids: ucs.includes(ucId) ? ucs.filter((x) => x !== ucId) : [...ucs, ucId] };
    setProvidesToAgents(updated);
  }

  if (sysLoading || ucLoading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!system) return <p className="text-sm text-gray-500">System not found</p>;

  const agentName = genConfig.agent_name || system.name + " Agent";

  // Available agents for dropdowns (exclude already used + self)
  const asksUsed = asksAgents.map((a) => a.target_system_id);
  const providesUsed = providesToAgents.map((p) => p.source_system_id);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/workbench" className="text-xs text-tedee-cyan hover:underline">&larr; Back</Link>
          <h2 className="text-xl font-bold text-text-primary mt-1">{system.name}</h2>
          <p className="text-sm text-gray-500">{system.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">{system.status}</span>
          <button className={btnSecondary} onClick={handleSave} disabled={isSaving}>
            {saved ? "Saved!" : isSaving ? "Saving..." : "Save"}
          </button>
          <button className={btnPrimary} onClick={handleGenerate} disabled={genSpec.isPending || useCases.length === 0}>
            {genSpec.isPending ? "Generating..." : "Generate Agent Spec"}
          </button>
          <button className={btnDanger} onClick={async () => { if (confirm("Delete this system and all its use cases?")) { await deleteSys.mutateAsync(id!); nav("/workbench"); } }}>
            Delete
          </button>
        </div>
      </div>

      {/* Section A: API & Technology */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-3">API & Technology</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
          <div><span className="text-gray-500">Type:</span> <span className="text-text-primary">{system.api_type}</span></div>
          <div><span className="text-gray-500">Base URL:</span> <span className="text-text-primary">{system.api_base_url || "Not set"}</span></div>
          <div><span className="text-gray-500">Auth:</span> <span className="text-text-primary">{system.api_auth_type}</span></div>
          <div><span className="text-gray-500">API Key:</span> <span className="text-text-primary">{system.has_api_key ? "Set" : "Not set"}</span></div>
          <div className="col-span-2"><span className="text-gray-500">API Spec:</span> <span className="text-text-primary">{system.has_api_spec ? `Loaded (${system.api_spec_endpoint_count} endpoints)` : "Not uploaded"}</span></div>
        </div>
        <div className="space-y-3 mb-5 pb-5 border-b border-gray-100">
          <div className="flex gap-2">
            <input type="password" className={`${inp} flex-1`} placeholder="API Key" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} />
            <button className={btnGhostDefault} onClick={async () => { if (apiKeyInput) { await setApiKey.mutateAsync({ id: id!, apiKey: apiKeyInput }); setApiKeyInput(""); } }}>Set Key</button>
          </div>
          <div className="flex gap-2">
            <textarea className={`${inp} flex-1`} placeholder="Paste OpenAPI/Swagger JSON spec..." rows={3} value={specInput} onChange={(e) => setSpecInput(e.target.value)} />
            <button className={`${btnGhostDefault} self-start`} onClick={handleUploadSpec}>Upload Spec</button>
          </div>
          <div className="flex items-center gap-3">
            <button className={btnGhostDefault} onClick={() => testConn.mutate(id!)} disabled={testConn.isPending}>Test Connection</button>
            {testConn.data && <span className={`text-xs font-medium ${testConn.data.ok ? "text-green-600" : "text-red-600"}`}>{testConn.data.ok ? `Connected (${testConn.data.status_code})` : `Failed: ${testConn.data.error}`}</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs text-gray-500 mb-1">Technology Stack</label>
            <select className={inp} value={genConfig.tech_stack} onChange={(e) => setGenConfig({ ...genConfig, tech_stack: e.target.value })}>
              <option>Python 3.11</option><option>Python 3.12</option><option>Node.js / TypeScript</option>
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Framework</label>
            <input className={inp} value={genConfig.framework} onChange={(e) => setGenConfig({ ...genConfig, framework: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs text-gray-500 mb-1">Deployment</label>
            <input className={inp} value={genConfig.deployment} onChange={(e) => setGenConfig({ ...genConfig, deployment: e.target.value })} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Error Handling</label>
            <input className={inp} value={genConfig.error_handling} onChange={(e) => setGenConfig({ ...genConfig, error_handling: e.target.value })} /></div>
        </div>
        <div><label className="block text-xs text-gray-500 mb-1">Authentication Notes</label>
          <input className={inp} value={genConfig.auth_notes} onChange={(e) => setGenConfig({ ...genConfig, auth_notes: e.target.value })} /></div>
      </div>

      {/* Section B: Behavior */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-3">Behavior</h3>
        <div className="mb-3"><label className="block text-xs text-gray-500 mb-1">Agent Name</label>
          <input className={inp} value={genConfig.agent_name} onChange={(e) => setGenConfig({ ...genConfig, agent_name: e.target.value })} /></div>
        <div className="mb-3"><label className="block text-xs text-gray-500 mb-1">Agent Role & Persona</label>
          <AutoTextarea className={inp} value={genConfig.agent_role} onChange={(v) => setGenConfig({ ...genConfig, agent_role: v })} placeholder="How should this agent behave?" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Additional Context</label>
          <AutoTextarea className={inp} value={genConfig.additional_context} onChange={(v) => setGenConfig({ ...genConfig, additional_context: v })} placeholder="Business rules, compliance, rate limits..." /></div>
      </div>

      {/* Section C: Interactions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-4">Interactions</h3>
        <div className="space-y-5">
          {/* Asks */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">This Agent Asks</h4>
            {asksAgents.map((la, idx) => {
              const usedIds = asksAgents.filter((_, i) => i !== idx).map((a) => a.target_system_id);
              const options = allSystems.filter((s) => !usedIds.includes(s.id));
              return (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-600 font-medium whitespace-nowrap">{agentName}</span>
                    <span className="text-gray-400">asks</span>
                    <select className={`${inp} w-auto flex-1`} value={la.target_system_id} onChange={(e) => updateAsk(idx, e.target.value)}>
                      {options.map((s) => <option key={s.id} value={s.id}>{s.name} Agent</option>)}
                    </select>
                    <span className="text-gray-400">for</span>
                    <button className={btnGhostDanger} onClick={() => setAsksAgents(asksAgents.filter((_, i) => i !== idx))}>Remove</button>
                  </div>
                  {(allUseCasesBySystem[la.target_system_id] || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 ml-1">
                      {(allUseCasesBySystem[la.target_system_id] || []).map((uc) => (
                        <label key={uc.id} className={`text-xs px-2 py-1 rounded border cursor-pointer transition-colors ${la.use_case_ids.includes(uc.id) ? "border-tedee-cyan bg-tedee-cyan/10 text-tedee-navy" : "border-gray-200 bg-white text-gray-500"}`}>
                          <input type="checkbox" className="hidden" checked={la.use_case_ids.includes(uc.id)} onChange={() => toggleAskUc(idx, uc.id)} />
                          {uc.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {allSystems.filter((s) => !asksUsed.includes(s.id)).length > 0 ? (
              <button className={btnGhostDefault} onClick={addAsk}>+ Add</button>
            ) : allSystems.length === 0 ? (
              <p className="text-xs text-gray-400">Add more systems to link agents together.</p>
            ) : asksAgents.length > 0 ? <p className="text-xs text-gray-400">All available agents linked.</p> : null}
          </div>

          {/* Provides to */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">This Agent Provides Information To</h4>
            {providesToAgents.map((la, idx) => {
              const usedIds = providesToAgents.filter((_, i) => i !== idx).map((p) => p.source_system_id);
              const options = allSystems.filter((s) => !usedIds.includes(s.id));
              return (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-600 font-medium whitespace-nowrap">{agentName}</span>
                    <span className="text-gray-400">provides to</span>
                    <select className={`${inp} w-auto flex-1`} value={la.source_system_id} onChange={(e) => updateProvides(idx, e.target.value)}>
                      {options.map((s) => <option key={s.id} value={s.id}>{s.name} Agent</option>)}
                    </select>
                    <span className="text-gray-400">for</span>
                    <button className={btnGhostDanger} onClick={() => setProvidesToAgents(providesToAgents.filter((_, i) => i !== idx))}>Remove</button>
                  </div>
                  {(allUseCasesBySystem[la.source_system_id] || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 ml-1">
                      {(allUseCasesBySystem[la.source_system_id] || []).map((uc) => (
                        <label key={uc.id} className={`text-xs px-2 py-1 rounded border cursor-pointer transition-colors ${la.use_case_ids.includes(uc.id) ? "border-tedee-cyan bg-tedee-cyan/10 text-tedee-navy" : "border-gray-200 bg-white text-gray-500"}`}>
                          <input type="checkbox" className="hidden" checked={la.use_case_ids.includes(uc.id)} onChange={() => toggleProvidesUc(idx, uc.id)} />
                          {uc.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {allSystems.filter((s) => !providesUsed.includes(s.id)).length > 0 ? (
              <button className={btnGhostDefault} onClick={addProvidesTo}>+ Add</button>
            ) : allSystems.length === 0 ? (
              <p className="text-xs text-gray-400">Add more systems to link agents together.</p>
            ) : providesToAgents.length > 0 ? <p className="text-xs text-gray-400">All available agents linked.</p> : null}
          </div>
        </div>
      </div>

      {/* Section D: Use Cases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Use Cases ({useCases.length})</h3>
          <button className={btnPrimary} onClick={() => setShowUcForm(!showUcForm)}>+ Add Use Case</button>
        </div>
        {showUcForm && (
          <form className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-3 space-y-3" onSubmit={handleCreateUc}>
            <input className={inp} placeholder="Use case name *" required value={ucForm.name} onChange={(e) => setUcForm({ ...ucForm, name: e.target.value })} />
            <input className={inp} placeholder="Description" value={ucForm.description} onChange={(e) => setUcForm({ ...ucForm, description: e.target.value })} />
            <textarea className={inp} placeholder="Trigger — what triggers this?" rows={2} value={ucForm.trigger_text} onChange={(e) => setUcForm({ ...ucForm, trigger_text: e.target.value })} />
            <textarea className={inp} placeholder="User input — what does the user provide?" rows={2} value={ucForm.user_input} onChange={(e) => setUcForm({ ...ucForm, user_input: e.target.value })} />
            <textarea className={inp} placeholder="Expected output — what should the response contain?" rows={2} value={ucForm.expected_output} onChange={(e) => setUcForm({ ...ucForm, expected_output: e.target.value })} />
            <div className="flex gap-3 items-center">
              <input className={`${inp} flex-1`} placeholder="Frequency (e.g. ~200/day)" value={ucForm.frequency} onChange={(e) => setUcForm({ ...ucForm, frequency: e.target.value })} />
              <select className={`${inp} w-32`} value={ucForm.priority} onChange={(e) => setUcForm({ ...ucForm, priority: e.target.value })}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
                <input type="checkbox" checked={ucForm.is_write} onChange={(e) => setUcForm({ ...ucForm, is_write: e.target.checked })} /> Write operation
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className={btnPrimary} disabled={createUc.isPending}>Create</button>
              <button type="button" className={btnSecondary} onClick={() => setShowUcForm(false)}>Cancel</button>
            </div>
          </form>
        )}
        <div className="space-y-2">
          {useCases.map((uc) => (
            <div key={uc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-1">
                <Link to={`/workbench/systems/${id}/usecases/${uc.id}`} className="font-medium text-sm text-tedee-navy hover:underline">{uc.name}</Link>
                <div className="flex gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${uc.priority === "high" ? "bg-red-100 text-red-700" : uc.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{uc.priority}</span>
                  {uc.is_write && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">WRITE</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{uc.status}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">{uc.trigger_text || uc.description}</p>
              <div className="flex gap-2">
                <Link to={`/workbench/systems/${id}/usecases/${uc.id}`} className={`${btnGhost} bg-tedee-cyan/10 text-tedee-navy hover:bg-tedee-cyan/20`}>Open Playground</Link>
                <button className={btnGhostDanger} onClick={async () => { if (confirm("Delete this use case?")) await deleteUc.mutateAsync(uc.id); }}>Delete</button>
              </div>
            </div>
          ))}
          {useCases.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No use cases yet. Define what humans do with this system today.</p>}
        </div>
      </div>
    </div>
  );
}
