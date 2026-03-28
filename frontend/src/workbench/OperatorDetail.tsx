import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { UseCase, AgentConfig, SpecConfig } from "../types";
import {
  useAgent, useUseCases,
  useDeleteUseCase, useDeleteAgent,
  useSetApiKey, useUploadSpec, useTestConnection, useGenerateSpec,
  useSaveAgentConfig,
} from "./queries";
import { generateSpecFromDocs } from "./api";
import { btnPrimary, btnSecondary, btnDanger, btnGhost, btnGhostDanger, btnGhostCyan, inp } from "./ui";

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

function generateAdditionalContext(agent: { name: string; api_type: string; api_base_url: string; api_auth_type?: string; has_api_spec: boolean; api_spec_endpoint_count?: number; api_docs_url?: string }, ucs: UseCase[]): string {
  const lines: string[] = [];
  if (agent.api_base_url) lines.push(`API Base URL: ${agent.api_base_url}`);
  if (agent.api_auth_type && agent.api_auth_type !== "none") lines.push(`Authentication: ${agent.api_auth_type}`);
  if (agent.has_api_spec) lines.push(`OpenAPI spec loaded with ${agent.api_spec_endpoint_count ?? "unknown number of"} endpoints.`);
  if (agent.api_docs_url) lines.push(`API docs: ${agent.api_docs_url}`);
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

// --- Component ---

export default function OperatorDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: agent, isLoading: agentLoading } = useAgent(id!);
  const { data: useCases = [], isLoading: ucLoading } = useUseCases(id!);

  const deleteUc = useDeleteUseCase();
  const deleteAg = useDeleteAgent();
  const setApiKey = useSetApiKey();
  const uploadSpec = useUploadSpec();
  const testConn = useTestConnection();
  const genSpec = useGenerateSpec();
  const saveConfig = useSaveAgentConfig();

  // Forms
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [specInput, setSpecInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [genConfigOpen, setGenConfigOpen] = useState(false);

  // Config state
  const [genConfig, setGenConfig] = useState({
    agent_name: "", tech_stack: "Python 3.11", framework: "FastAPI + anthropic SDK",
    deployment: "Standalone microservice (Docker)",
    error_handling: "Retry once on 5xx, return graceful error message to user on failure",
    auth_notes: "",
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load config from DB or generate defaults
  useEffect(() => {
    if (!agent || configLoaded) return;
    const c = agent.agent_config;
    if (c) {
      setGenConfig({
        agent_name: c.agent_name || agent.name + " Operator",
        tech_stack: c.tech_stack || "Python 3.11",
        framework: c.framework || "FastAPI + anthropic SDK",
        deployment: c.deployment || "Standalone microservice (Docker)",
        error_handling: c.error_handling || "Retry once on 5xx, return graceful error message to user on failure",
        auth_notes: c.auth_notes || "",
      });
      setConfigLoaded(true);
    } else if (useCases.length > 0) {
      setGenConfig((prev) => ({
        ...prev,
        agent_name: prev.agent_name || agent.name + " Operator",
        auth_notes: prev.auth_notes || (agent.api_auth_type && agent.api_auth_type !== "none" ? `${agent.api_auth_type} — API key from env var` : ""),
      }));
      setConfigLoaded(true);
    }
  }, [agent, useCases, configLoaded]);

  // --- Save ---

  const handleSave = async () => {
    try {
      const config: AgentConfig = {
        ...genConfig,
        agent_persona: "",
        additional_context: "",
      };
      await saveConfig.mutateAsync({ id: id!, config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      alert("Save failed: " + (e instanceof Error ? e.message : "unknown error"));
    }
  };

  const isSaving = saveConfig.isPending;

  // --- Other handlers ---

  const [specLoading, setSpecLoading] = useState(false);

  const handleUploadSpec = async () => {
    const input = specInput.trim();
    if (!input) return;

    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    const urls = lines.filter((l) => l.startsWith("http://") || l.startsWith("https://"));

    // Case 1: All lines are URLs → try direct fetch first, fallback to AI generation
    if (urls.length > 0 && urls.length === lines.length) {
      setSpecLoading(true);

      // If single URL, try direct fetch + common paths first
      if (urls.length === 1) {
        const baseUrl = urls[0].replace(/\/+$/, "");
        const urlsToTry = [
          baseUrl,
          ...(baseUrl.endsWith(".json") || baseUrl.endsWith(".yaml") ? [] : [
            `${baseUrl}/openapi.json`, `${baseUrl}/swagger.json`, `${baseUrl}/api-docs`,
          ]),
        ];
        for (const url of urlsToTry) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const ct = resp.headers.get("content-type") || "";
            if (!ct.includes("json")) continue;
            const spec = await resp.json();
            if (spec && (spec.openapi || spec.swagger || spec.paths)) {
              await uploadSpec.mutateAsync({ id: id!, spec });
              setSpecInput("");
              setSpecLoading(false);
              return;
            }
          } catch { /* try next */ }
        }
      }

      // No direct spec found — use AI to analyze docs pages and generate spec
      try {
        const spec = await generateSpecFromDocs(urls, agent?.name || "", agent?.api_base_url || "");
        if (spec && (spec.openapi || spec.paths)) {
          await uploadSpec.mutateAsync({ id: id!, spec });
          setSpecInput("");
        } else {
          alert("AI could not generate a valid spec from the provided URLs.");
        }
      } catch (e: unknown) {
        alert("Failed to generate spec from docs: " + (e instanceof Error ? e.message : "Unknown error"));
      }
      setSpecLoading(false);
      return;
    }

    // Case 2: Raw JSON
    try {
      const spec = JSON.parse(input);
      await uploadSpec.mutateAsync({ id: id!, spec });
      setSpecInput("");
    } catch {
      alert("Could not parse input.\n\nAccepted formats:\n• Raw OpenAPI JSON\n• One or more documentation URLs (one per line)");
    }
  };

  const handleGenerate = async () => {
    // Save first
    await handleSave();

    const additionalContext = generateAdditionalContext(agent!, useCases);

    const config: SpecConfig = {
      tech_stack: genConfig.tech_stack,
      framework: genConfig.framework,
      agent_role: "operator",
      deployment: genConfig.deployment,
      error_handling: genConfig.error_handling,
      auth_notes: genConfig.auth_notes,
      additional_context: additionalContext,
      interactions: "",
    };
    try {
      const spec = await genSpec.mutateAsync({
        agentName: genConfig.agent_name || agent!.name + " Operator",
        agentIds: [id!], useCaseIds: useCases.map((u) => u.id), config,
      });
      nav(`/workbench/specs/${spec.id}`);
    } catch (e: unknown) {
      alert("Generation failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  if (agentLoading || ucLoading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!agent) return <p className="text-sm text-gray-500">Agent not found</p>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{agent.name}</h2>
          <p className="text-sm text-gray-500">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">{agent.status}</span>
          <button className={btnSecondary} onClick={handleSave} disabled={isSaving}>
            {saved ? "Saved!" : isSaving ? "Saving..." : "Save"}
          </button>
          <button className={btnPrimary} onClick={handleGenerate} disabled={genSpec.isPending || useCases.length === 0}>
            {genSpec.isPending ? "Generating..." : "Generate"}
          </button>
          <button className={btnDanger} onClick={async () => { if (confirm("Delete this operator and all its use cases?")) { await deleteAg.mutateAsync(id!); nav("/workbench"); } }}>
            Delete
          </button>
        </div>
      </div>

      {/* Section A: API Connection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-3">API Connection</h3>
        {(() => {
          const isMcp = agent.api_type === "mcp";
          return (<>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
              <div><span className="text-gray-500">Type:</span> <span className="text-text-primary">{isMcp ? "MCP Server" : agent.api_type}</span></div>
              <div><span className="text-gray-500">{isMcp ? "Server URI:" : "Base URL:"}</span> <span className="text-text-primary">{agent.api_base_url || "Not set"}</span></div>
              <div><span className="text-gray-500">Auth:</span> <span className="text-text-primary">{agent.api_auth_type}</span></div>
              <div><span className="text-gray-500">{isMcp ? "Auth Token:" : "API Key:"}</span> <span className="text-text-primary">{agent.has_api_key ? "Set" : "Not set"}</span></div>
              <div className="col-span-2"><span className="text-gray-500">{isMcp ? "Tool Definitions:" : "API Spec:"}</span> <span className="text-text-primary">{agent.has_api_spec ? `Loaded (${agent.api_spec_endpoint_count} ${isMcp ? "tools" : "endpoints"})` : "Not uploaded"}</span></div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="password" className={`${inp} flex-1`} placeholder={isMcp ? "Auth token" : "API Key"} value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} />
                <button className={btnGhost} onClick={async () => { if (apiKeyInput) { await setApiKey.mutateAsync({ id: id!, apiKey: apiKeyInput }); setApiKeyInput(""); } }}>{isMcp ? "Set Token" : "Set Key"}</button>
              </div>
              <div className="flex gap-2">
                <textarea className={`${inp} flex-1`}
                  placeholder={isMcp ? "Paste MCP tool definitions JSON..." : "Paste OpenAPI JSON, a spec URL, or documentation URLs (one per line) — AI will generate the spec"}
                  rows={2} value={specInput} onChange={(e) => setSpecInput(e.target.value)} />
                <button className={`${btnGhost} self-start`} onClick={handleUploadSpec} disabled={specLoading}>
                  {specLoading ? "Fetching..." : isMcp ? "Upload Tools" : "Upload Spec"}
                </button>
              </div>
              {!isMcp && (
                <div className="flex items-center gap-3">
                  <button className={btnGhost} onClick={() => testConn.mutate(id!)} disabled={testConn.isPending}>Test Connection</button>
                  {testConn.data && <span className={`text-xs font-medium ${testConn.data.ok ? "text-green-600" : "text-red-600"}`}>{testConn.data.ok ? `Connected (${testConn.data.status_code})` : `Failed: ${testConn.data.error}`}</span>}
                </div>
              )}
            </div>
          </>);
        })()}
      </div>

      {/* Section B: Use Cases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Use Cases ({useCases.length})</h3>
          <Link to={`/workbench/agents/${id}/usecases/new`} className={btnPrimary}>+ Add Use Case</Link>
        </div>
        <div className="space-y-2">
          {useCases.map((uc) => (
            <div key={uc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-1">
                <Link to={`/workbench/agents/${id}/usecases/${uc.id}`} className="font-medium text-sm text-tedee-navy hover:underline">{uc.name}</Link>
                <div className="flex gap-1.5">
                  {uc.is_write && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">WRITE</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{uc.status}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">{uc.trigger_text || uc.description}</p>
              <div className="flex gap-2">
                <Link to={`/workbench/agents/${id}/usecases/${uc.id}`} className={btnGhostCyan}>Open Playground</Link>
                <button className={btnGhostDanger} onClick={async () => { if (confirm("Delete this use case?")) await deleteUc.mutateAsync(uc.id); }}>Delete</button>
              </div>
            </div>
          ))}
          {useCases.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No use cases yet. Define what this operator exposes as MCP tools.</p>}
        </div>
      </div>

      {/* Section C: Generation Config (collapsible) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setGenConfigOpen(!genConfigOpen)}
        >
          <h3 className="font-semibold text-text-primary">Generation Config</h3>
          <span className="text-gray-400 text-sm">{genConfigOpen ? "Hide" : "Show"}</span>
        </button>
        {genConfigOpen && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Agent Name</label>
                <input className={inp} value={genConfig.agent_name} onChange={(e) => setGenConfig({ ...genConfig, agent_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Technology Stack</label>
                <select className={inp} value={genConfig.tech_stack} onChange={(e) => setGenConfig({ ...genConfig, tech_stack: e.target.value })}>
                  <option>Python 3.11</option><option>Python 3.12</option><option>Node.js / TypeScript</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Framework</label>
                <input className={inp} value={genConfig.framework} onChange={(e) => setGenConfig({ ...genConfig, framework: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Deployment</label>
                <input className={inp} value={genConfig.deployment} onChange={(e) => setGenConfig({ ...genConfig, deployment: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Error Handling</label>
                <input className={inp} value={genConfig.error_handling} onChange={(e) => setGenConfig({ ...genConfig, error_handling: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Authentication Notes</label>
                <AutoTextarea className={inp} value={genConfig.auth_notes} onChange={(v) => setGenConfig({ ...genConfig, auth_notes: v })} placeholder="Auth details for code generation..." />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
