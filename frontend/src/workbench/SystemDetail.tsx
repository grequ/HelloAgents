import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { UseCaseCreate, UseCase, System, SpecConfig } from "../types";
import {
  useSystem, useSystems, useUseCases,
  useCreateUseCase, useDeleteUseCase, useDeleteSystem,
  useSetApiKey, useUploadSpec, useTestConnection, useGenerateSpec,
} from "./queries";
import { listUseCases } from "./api";

interface LinkedAgent {
  systemId: string;
  systemName: string;
  direction: "calls" | "called_by";
  useCaseIds: string[];
}

const EMPTY_UC: UseCaseCreate = {
  name: "", description: "", trigger_text: "", user_input: "",
  expected_output: "", frequency: "", is_write: false, priority: "medium",
};

function generateAdditionalContext(sys: System, ucs: UseCase[]): string {
  const lines: string[] = [];

  // API details
  if (sys.api_base_url) lines.push(`API Base URL: ${sys.api_base_url}`);
  if (sys.api_auth_type && sys.api_auth_type !== "none") lines.push(`Authentication: ${sys.api_auth_type}`);
  if (sys.has_api_spec) lines.push(`OpenAPI spec loaded with ${sys.api_spec_endpoint_count ?? "unknown number of"} endpoints.`);
  if (sys.api_docs_url) lines.push(`API docs: ${sys.api_docs_url}`);

  // Use case coverage summary
  const tested = ucs.filter((u) => u.status === "tested");
  const discovered = ucs.filter((u) => u.status === "discovered" || u.status === "tested");
  if (tested.length > 0) lines.push(`\n${tested.length} of ${ucs.length} use cases have been live-tested against the real API.`);
  if (discovered.length > tested.length) lines.push(`${discovered.length - tested.length} additional use cases have discovered endpoints but are untested.`);

  // Write operations — flag for safety
  const writes = ucs.filter((u) => u.is_write);
  if (writes.length > 0) lines.push(`\nWrite operations (${writes.map((u) => u.name).join(", ")}): require user confirmation and should include rollback guidance in error responses.`);

  // High-frequency use cases — flag for performance
  const highFreq = ucs.filter((u) => u.frequency);
  if (highFreq.length > 0) {
    const freqSummary = highFreq.map((u) => `${u.name} (${u.frequency})`).join(", ");
    lines.push(`\nExpected traffic: ${freqSummary}. Consider caching or batching for high-volume calls.`);
  }

  // Discovered endpoint patterns
  const allEndpoints = ucs.flatMap((u) => u.discovered_endpoints || []);
  if (allEndpoints.length > 0) {
    const methods = [...new Set(allEndpoints.map((e) => e.method))];
    const paths = [...new Set(allEndpoints.map((e) => e.path))];
    lines.push(`\nDiscovered ${allEndpoints.length} endpoint calls across ${paths.length} unique paths (methods: ${methods.join(", ")}).`);
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
  if (writeUcs.length > 0) role += `Your write operations include: ${writeUcs.map((u) => u.name.toLowerCase()).join(", ")}. Write operations require explicit user confirmation before execution. `;
  role += `\n\nBehavior guidelines:\n`;
  role += `- Always use ONLY data from tool results. Never fabricate information.\n`;
  role += `- Be concise and factual. Lead with the answer, then provide supporting details.\n`;
  role += `- If a tool call fails, explain what happened and suggest alternatives.\n`;
  role += `- If the request is outside your domain, say so clearly.\n`;
  if (highPri.length > 0) role += `- Prioritize these high-frequency use cases: ${highPri.map((u) => u.name).join(", ")}.\n`;
  role += `- For write operations, always confirm the action with the user before proceeding.\n`;
  role += `- Never expose internal system IDs, API keys, or technical details to end users.`;
  return role;
}

export default function SystemDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: system, isLoading: sysLoading } = useSystem(id!);
  const { data: useCases = [], isLoading: ucLoading } = useUseCases(id!);
  const { data: allSystemsList = [] } = useSystems();

  const createUc = useCreateUseCase();
  const deleteUc = useDeleteUseCase();
  const deleteSys = useDeleteSystem();
  const setApiKey = useSetApiKey();
  const uploadSpec = useUploadSpec();
  const testConn = useTestConnection();
  const genSpec = useGenerateSpec();

  const allSystems = allSystemsList.filter((s) => s.id !== id);

  // Forms
  const [showUcForm, setShowUcForm] = useState(false);
  const [ucForm, setUcForm] = useState<UseCaseCreate>({ ...EMPTY_UC });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [specInput, setSpecInput] = useState("");
  const [showGenForm, setShowGenForm] = useState(false);
  const [genConfig, setGenConfig] = useState({
    agent_name: "",
    tech_stack: "Python 3.11",
    framework: "FastAPI + anthropic SDK",
    agent_role: "",
    deployment: "Standalone microservice (Docker)",
    error_handling: "Retry once on 5xx, return graceful error message to user on failure",
    auth_notes: "",
    additional_context: "",
  });
  const [linkedAgents, setLinkedAgents] = useState<LinkedAgent[]>([]);
  const [allUseCasesBySystem, setAllUseCasesBySystem] = useState<Record<string, UseCase[]>>({});

  // Load use cases for other systems (for interaction linking)
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

  // Pre-fill agent name, role, auth notes, and additional context
  useEffect(() => {
    if (system && useCases.length > 0) {
      setGenConfig((c) => ({
        ...c,
        agent_name: c.agent_name || system.name + " Agent",
        agent_role: c.agent_role || generateRoleFromUseCases(system, useCases),
        auth_notes: c.auth_notes || (system.api_auth_type && system.api_auth_type !== "none" ? `${system.api_auth_type} — API key from env var` : ""),
        additional_context: c.additional_context || generateAdditionalContext(system, useCases),
      }));
    }
  }, [system, useCases]);

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
    const interactionLines = linkedAgents.map((la) => {
      const dir = la.direction === "calls" ? "This agent calls" : "This agent is called by";
      const ucNames = la.useCaseIds
        .map((ucId) => (allUseCasesBySystem[la.systemId] || []).find((u) => u.id === ucId)?.name)
        .filter(Boolean);
      return `${dir}: ${la.systemName} Agent` + (ucNames.length ? ` (use cases: ${ucNames.join(", ")})` : "");
    });

    const config: SpecConfig = {
      tech_stack: genConfig.tech_stack,
      framework: genConfig.framework,
      agent_role: genConfig.agent_role,
      deployment: genConfig.deployment,
      interactions: interactionLines.join("\n") || "",
      error_handling: genConfig.error_handling,
      auth_notes: genConfig.auth_notes,
      additional_context: genConfig.additional_context,
    };

    try {
      const spec = await genSpec.mutateAsync({
        agentName: genConfig.agent_name || system!.name + " Agent",
        systemIds: [id!],
        useCaseIds: useCases.map((u) => u.id),
        config,
      });
      nav(`/workbench/agents/${spec.id}`);
    } catch (e: unknown) {
      alert("Generation failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const addLinkedAgent = () => {
    if (allSystems.length === 0) return;
    setLinkedAgents([...linkedAgents, {
      systemId: allSystems[0].id, systemName: allSystems[0].name,
      direction: "calls", useCaseIds: [],
    }]);
  };

  const updateLinkedAgent = (idx: number, field: string, value: string) => {
    const updated = [...linkedAgents];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "systemId") {
      updated[idx].systemName = allSystems.find((s) => s.id === value)?.name || "";
      updated[idx].useCaseIds = [];
    }
    setLinkedAgents(updated);
  };

  const toggleLinkedUseCase = (agentIdx: number, ucId: string) => {
    const updated = [...linkedAgents];
    const ucs = updated[agentIdx].useCaseIds;
    updated[agentIdx].useCaseIds = ucs.includes(ucId) ? ucs.filter((x) => x !== ucId) : [...ucs, ucId];
    setLinkedAgents(updated);
  };

  // Input styles
  const inp = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan";
  const btnPrimary = "px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan disabled:opacity-50 transition-colors";
  const btnSecondary = "px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-100 transition-colors";
  const btnDanger = "px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors";
  const btnSm = "px-3 py-1.5 rounded-md text-xs font-medium";

  if (sysLoading || ucLoading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!system) return <p className="text-sm text-gray-500">System not found</p>;

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
          <button className={btnDanger} onClick={async () => { if (confirm("Delete this system and all its use cases?")) { await deleteSys.mutateAsync(id!); nav("/workbench"); } }}>
            Delete
          </button>
        </div>
      </div>

      {/* API Configuration */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-3">API Configuration</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
          <div><span className="text-gray-500">Type:</span> <span className="text-text-primary">{system.api_type}</span></div>
          <div><span className="text-gray-500">Base URL:</span> <span className="text-text-primary">{system.api_base_url || "Not set"}</span></div>
          <div><span className="text-gray-500">Auth:</span> <span className="text-text-primary">{system.api_auth_type}</span></div>
          <div><span className="text-gray-500">API Key:</span> <span className="text-text-primary">{system.has_api_key ? "Set" : "Not set"}</span></div>
          <div className="col-span-2"><span className="text-gray-500">API Spec:</span> <span className="text-text-primary">{system.has_api_spec ? `Loaded (${system.api_spec_endpoint_count} endpoints)` : "Not uploaded"}</span></div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input type="password" className={`${inp} flex-1`} placeholder="API Key" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} />
            <button className={`${btnSm} bg-gray-100 text-gray-700 hover:bg-gray-200`} onClick={async () => { if (apiKeyInput) { await setApiKey.mutateAsync({ id: id!, apiKey: apiKeyInput }); setApiKeyInput(""); } }}>
              Set Key
            </button>
          </div>
          <div className="flex gap-2">
            <textarea className={`${inp} flex-1`} placeholder="Paste OpenAPI/Swagger JSON spec here..." rows={3} value={specInput} onChange={(e) => setSpecInput(e.target.value)} />
            <button className={`${btnSm} bg-gray-100 text-gray-700 hover:bg-gray-200 self-start`} onClick={handleUploadSpec}>
              Upload Spec
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button className={`${btnSm} bg-gray-100 text-gray-700 hover:bg-gray-200`} onClick={() => testConn.mutate(id!)} disabled={testConn.isPending}>
              Test Connection
            </button>
            {testConn.data && (
              <span className={`text-xs font-medium ${testConn.data.ok ? "text-green-600" : "text-red-600"}`}>
                {testConn.data.ok ? `Connected (${testConn.data.status_code})` : `Failed: ${testConn.data.error}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Use Cases ({useCases.length})</h3>
          <button className={btnPrimary} onClick={() => setShowUcForm(!showUcForm)}>+ Add Use Case</button>
        </div>

        {showUcForm && (
          <form className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-3 space-y-3" onSubmit={handleCreateUc}>
            <input className={inp} placeholder="Use case name *" required value={ucForm.name} onChange={(e) => setUcForm({ ...ucForm, name: e.target.value })} />
            <input className={inp} placeholder="Description" value={ucForm.description} onChange={(e) => setUcForm({ ...ucForm, description: e.target.value })} />
            <textarea className={inp} placeholder="Trigger — what question or event triggers this?" rows={2} value={ucForm.trigger_text} onChange={(e) => setUcForm({ ...ucForm, trigger_text: e.target.value })} />
            <textarea className={inp} placeholder="User input — what information does the user provide?" rows={2} value={ucForm.user_input} onChange={(e) => setUcForm({ ...ucForm, user_input: e.target.value })} />
            <textarea className={inp} placeholder="Expected output — what should the response contain?" rows={2} value={ucForm.expected_output} onChange={(e) => setUcForm({ ...ucForm, expected_output: e.target.value })} />
            <div className="flex gap-3 items-center">
              <input className={`${inp} flex-1`} placeholder="Frequency (e.g. ~200/day)" value={ucForm.frequency} onChange={(e) => setUcForm({ ...ucForm, frequency: e.target.value })} />
              <select className={`${inp} w-32`} value={ucForm.priority} onChange={(e) => setUcForm({ ...ucForm, priority: e.target.value })}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
                <input type="checkbox" checked={ucForm.is_write} onChange={(e) => setUcForm({ ...ucForm, is_write: e.target.checked })} />
                Write operation
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
                <Link to={`/workbench/systems/${id}/usecases/${uc.id}`} className="font-medium text-sm text-tedee-navy hover:underline">
                  {uc.name}
                </Link>
                <div className="flex gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${uc.priority === "high" ? "bg-red-100 text-red-700" : uc.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {uc.priority}
                  </span>
                  {uc.is_write && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">WRITE</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{uc.status}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">{uc.trigger_text || uc.description}</p>
              <div className="flex gap-2">
                <Link to={`/workbench/systems/${id}/usecases/${uc.id}`} className={`${btnSm} bg-tedee-cyan/10 text-tedee-navy hover:bg-tedee-cyan/20`}>
                  Open Playground
                </Link>
                <button className={`${btnSm} text-red-600 hover:bg-red-50`} onClick={async () => { if (confirm("Delete this use case?")) await deleteUc.mutateAsync(uc.id); }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {useCases.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No use cases yet. Define what humans do with this system today.</p>}
        </div>
      </div>

      {/* Generate Spec */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Generate Agent Spec</h3>
          {useCases.length > 0 && (
            <button className={btnSecondary} onClick={() => setShowGenForm(!showGenForm)}>
              {showGenForm ? "Hide Config" : "Configure & Generate"}
            </button>
          )}
        </div>

        {useCases.length === 0 ? (
          <p className="text-sm text-gray-500">Add use cases first before generating a spec.</p>
        ) : !showGenForm ? (
          <p className="text-xs text-gray-400">{useCases.length} use cases will be included. {useCases.filter((u) => u.status === "tested").length} tested. Click "Configure & Generate" to set up the spec.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">Configure the agent before generating. The output will be a complete .md file you can drop into Claude Code.</p>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Agent Name</label><input className={inp} value={genConfig.agent_name} onChange={(e) => setGenConfig({ ...genConfig, agent_name: e.target.value })} /></div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Technology Stack</label>
                <select className={inp} value={genConfig.tech_stack} onChange={(e) => setGenConfig({ ...genConfig, tech_stack: e.target.value })}>
                  <option>Python 3.11</option><option>Python 3.12</option><option>Node.js / TypeScript</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Framework</label><input className={inp} value={genConfig.framework} onChange={(e) => setGenConfig({ ...genConfig, framework: e.target.value })} placeholder="e.g. FastAPI + anthropic SDK" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Deployment</label><input className={inp} value={genConfig.deployment} onChange={(e) => setGenConfig({ ...genConfig, deployment: e.target.value })} placeholder="e.g. Docker, AWS Lambda" /></div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Agent Role & Persona</label>
              <textarea className={inp} rows={2} value={genConfig.agent_role} onChange={(e) => setGenConfig({ ...genConfig, agent_role: e.target.value })} placeholder="How should this agent behave?" />
            </div>

            {/* Linked Agents */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Interactions with Other Agents</label>
              <p className="text-xs text-gray-400 mb-2">Link this agent to others in your system.</p>
              {linkedAgents.map((la, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                  <div className="flex gap-2 items-center mb-2">
                    <select className={`${inp} w-auto`} value={la.direction} onChange={(e) => updateLinkedAgent(idx, "direction", e.target.value)}>
                      <option value="calls">This agent CALLS</option>
                      <option value="called_by">This agent is CALLED BY</option>
                    </select>
                    <select className={`${inp} w-auto flex-1`} value={la.systemId} onChange={(e) => updateLinkedAgent(idx, "systemId", e.target.value)}>
                      {allSystems.map((s) => <option key={s.id} value={s.id}>{s.name} Agent</option>)}
                    </select>
                    <button className={`${btnSm} text-red-600 hover:bg-red-50`} onClick={() => setLinkedAgents(linkedAgents.filter((_, i) => i !== idx))}>X</button>
                  </div>
                  {(allUseCasesBySystem[la.systemId] || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-gray-400">Use cases:</span>
                      {(allUseCasesBySystem[la.systemId] || []).map((uc) => (
                        <label key={uc.id} className={`text-xs px-2 py-1 rounded border cursor-pointer ${la.useCaseIds.includes(uc.id) ? "border-tedee-cyan bg-tedee-cyan/10 text-tedee-navy" : "border-gray-200 bg-white text-gray-600"}`}>
                          <input type="checkbox" className="hidden" checked={la.useCaseIds.includes(uc.id)} onChange={() => toggleLinkedUseCase(idx, uc.id)} />
                          {uc.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {allSystems.length > 0 ? (
                <button className={`${btnSm} bg-gray-100 text-gray-700 hover:bg-gray-200 mt-1`} onClick={addLinkedAgent}>+ Link Another Agent</button>
              ) : (
                <p className="text-xs text-gray-400">Add more systems to the workbench to link agents together.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Error Handling Strategy</label><input className={inp} value={genConfig.error_handling} onChange={(e) => setGenConfig({ ...genConfig, error_handling: e.target.value })} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Authentication Notes</label><input className={inp} value={genConfig.auth_notes} onChange={(e) => setGenConfig({ ...genConfig, auth_notes: e.target.value })} /></div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Additional Context</label>
              <textarea className={inp} rows={2} value={genConfig.additional_context} onChange={(e) => setGenConfig({ ...genConfig, additional_context: e.target.value })} placeholder="Business rules, compliance requirements, rate limits..." />
            </div>

            <div className="flex items-center gap-3">
              <button className={btnPrimary} onClick={handleGenerate} disabled={genSpec.isPending}>
                {genSpec.isPending ? "Generating (this takes ~30s)..." : "Generate Agent Spec"}
              </button>
              <span className="text-xs text-gray-400">{useCases.length} use cases, {useCases.filter((u) => u.status === "tested").length} tested</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
