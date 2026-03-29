import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { UseCase, AgentTool } from "../types";
import {
  useAgent, useUseCases,
  useDeleteUseCase, useDeleteAgent, useUpdateAgent,
  useSetApiKey, useUploadSpec, useTestConnection, useGenerateSpec,
  useTools, useUpdateTool, useDeleteTool, useDiscoverTools,
} from "./queries";
import { fetchUrl } from "./api";
import { btnPrimary, btnDanger, btnGhost, btnGhostDanger, btnGhostCyan, inp } from "./ui";

// --- Tool Card ---

function ToolCard({ tool, useCaseNames, onSaved }: { tool: AgentTool; useCaseNames: Record<string, string>; onSaved?: () => void }) {
  const [name, setName] = useState(tool.name);
  const [desc, setDesc] = useState(tool.description);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const updateTool = useUpdateTool();
  const deleteTool = useDeleteTool();

  useEffect(() => { setName(tool.name); setDesc(tool.description); setDirty(false); }, [tool.name, tool.description]);

  const handleSave = () => {
    if (!dirty) return;
    updateTool.mutate({ id: tool.id, data: { name, description: desc } }, {
      onSuccess: () => { setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2000); onSaved?.(); },
    });
  };
  const toggleStatus = () => {
    const next = tool.status === "completed" ? "draft" : "completed";
    updateTool.mutate({ id: tool.id, data: { status: next } });
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-1">
        <input
          className="flex-1 min-w-0 font-mono text-sm font-semibold text-tedee-navy bg-transparent border-b border-transparent hover:border-gray-300 focus:border-tedee-cyan outline-none"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <div className="flex items-center gap-2 shrink-0">
          {dirty && <button onClick={handleSave} className="text-[10px] px-1.5 py-0.5 rounded bg-tedee-cyan/20 text-tedee-navy font-medium">{saved ? "Saved!" : "Save"}</button>}
          {tool.is_write && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">WRITE</span>
          )}
          <button
            onClick={toggleStatus}
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium cursor-pointer ${
              tool.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {tool.status}
          </button>
          <button
            onClick={() => { if (confirm("Delete this tool?")) deleteTool.mutate(tool.id); }}
            className="inline-flex items-center justify-center rounded-md px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
      <input
        className="w-full text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-tedee-cyan outline-none mb-2"
        value={desc}
        onChange={(e) => { setDesc(e.target.value); setDirty(true); }}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <div className="flex flex-wrap gap-1.5">
        {tool.endpoints.map((ep, i) => (
          <span key={i} className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-600">
            {ep.method} {ep.path}
          </span>
        ))}
      </div>
      {tool.use_case_ids && tool.use_case_ids.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">
          Covers: {tool.use_case_ids.map((ucId) => useCaseNames[ucId] || ucId).join(", ")}
        </p>
      )}
    </div>
  );
}

// --- Component ---

export default function OperatorDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: agent, isLoading: agentLoading } = useAgent(id!);
  const { data: useCases = [], isLoading: ucLoading } = useUseCases(id!);
  const { data: tools = [] } = useTools(id!);
  const discoverToolsMut = useDiscoverTools();
  const updateToolMut = useUpdateTool();
  const deleteToolMut = useDeleteTool();

  const deleteUc = useDeleteUseCase();
  const deleteAg = useDeleteAgent();
  const updateAg = useUpdateAgent();
  const setApiKeyMut = useSetApiKey();
  const uploadSpec = useUploadSpec();
  const testConn = useTestConnection();
  const genSpec = useGenerateSpec();

  // Name/description editing
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);

  // API key editing
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [editingKey, setEditingKey] = useState(false);

  // Spec input
  const [specInput, setSpecInput] = useState("");

  // Load saved spec source into textarea
  const specSourceLoaded = useRef(false);
  useEffect(() => {
    if (!agent || specSourceLoaded.current) return;
    if (agent.api_spec_source) {
      setSpecInput(agent.api_spec_source);
      specSourceLoaded.current = true;
    }
  }, [agent]);

  // Load name/description
  useEffect(() => {
    if (!agent || nameLoaded) return;
    setEditName(agent.name || "");
    setEditDesc(agent.description || "");
    setNameLoaded(true);
  }, [agent, nameLoaded]);

  const handleSaveNameDesc = async () => {
    if (!agent) return;
    if (editName === agent.name && editDesc === agent.description) return;
    await updateAg.mutateAsync({ id: id!, data: { name: editName, description: editDesc } });
  };

  // --- Other handlers ---

  const [specLoading, setSpecLoading] = useState(false);

  const handleUploadSpec = async () => {
    const input = specInput.trim();
    if (!input) return;

    // URL → fetch via backend (avoids CORS)
    if (input.startsWith("http://") || input.startsWith("https://")) {
      setSpecLoading(true);
      try {
        const spec = await fetchUrl(input);
        await uploadSpec.mutateAsync({ id: id!, spec, source: input });
      } catch (e: unknown) {
        alert("Failed to fetch spec from URL: " + (e instanceof Error ? e.message : "Unknown error"));
      } finally {
        setSpecLoading(false);
      }
      return;
    }

    // Raw JSON
    try {
      const spec = JSON.parse(input);
      await uploadSpec.mutateAsync({ id: id!, spec, source: input });
    } catch {
      alert("Invalid JSON.\n\nPaste either:\n• A Swagger/OpenAPI JSON spec\n• A URL to a swagger.json file (e.g. https://petstore.swagger.io/v2/swagger.json)");
    }
  };

  const handleGenerate = async () => {
    try {
      const spec = await genSpec.mutateAsync({
        agentName: agent!.name,
        agentIds: [id!],
        useCaseIds: useCases.map((u) => u.id),
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
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">{agent.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className={btnPrimary} onClick={handleGenerate} disabled={genSpec.isPending || useCases.length === 0}>
            {genSpec.isPending ? "Generating..." : "Generate"}
          </button>
          <button className={btnDanger} onClick={async () => { if (confirm("Delete this operator and all its use cases?")) { await deleteAg.mutateAsync(id!); nav("/workbench"); } }}>
            Delete
          </button>
        </div>
      </div>

      {/* Section: Agent Identity + API Connection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        {/* Name & Description (editable) */}
        <div className="mb-4 pb-4 border-b border-gray-100">
          <input
            className="w-full text-xl font-bold text-text-primary bg-transparent border-b border-transparent hover:border-gray-300 focus:border-tedee-cyan outline-none mb-1"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveNameDesc}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Agent name"
          />
          <input
            className="w-full text-sm text-gray-500 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-tedee-cyan outline-none"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            onBlur={handleSaveNameDesc}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Description"
          />
        </div>

        {/* API Connection */}
        <h3 className="font-semibold text-text-primary text-sm mb-3">API Connection</h3>
        {(() => {
          const isMcp = agent.api_type === "mcp";
          return (<>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
              <div><span className="text-gray-500">Type:</span> <span className="text-text-primary">{isMcp ? "MCP Server" : agent.api_type}</span></div>
              <div><span className="text-gray-500">{isMcp ? "Server URI:" : "Base URL:"}</span> <span className="text-text-primary">{agent.api_base_url || "Not set"}</span></div>
              <div><span className="text-gray-500">Auth:</span> <span className="text-text-primary">{agent.api_auth_type}</span></div>
              <div>
                <span className="text-gray-500">{isMcp ? "Auth Token:" : "API Key:"}</span>{" "}
                {agent.has_api_key ? (
                  <span className="font-mono text-text-primary text-xs">{agent.api_key_preview || "***"}</span>
                ) : (
                  <span className="text-gray-400">Not set</span>
                )}
              </div>
              <div className="col-span-2"><span className="text-gray-500">{isMcp ? "Tool Definitions:" : "API Spec:"}</span> <span className="text-text-primary">{agent.has_api_spec ? `Loaded (${agent.api_spec_endpoint_count} ${isMcp ? "tools" : "endpoints"})` : "Not uploaded"}</span></div>
            </div>
            <div className="space-y-3">
              {/* API Key — inline edit */}
              <div className="flex items-center gap-2">
                {editingKey ? (
                  <>
                    <input type="password" className={`${inp} flex-1`} placeholder={isMcp ? "New auth token" : "New API key"} value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} autoFocus />
                    <button className={btnGhost} onClick={async () => {
                      if (apiKeyInput) { await setApiKeyMut.mutateAsync({ id: id!, apiKey: apiKeyInput }); setApiKeyInput(""); }
                      setEditingKey(false);
                    }}>Save</button>
                    <button className={btnGhost} onClick={() => { setEditingKey(false); setApiKeyInput(""); }}>Cancel</button>
                  </>
                ) : (
                  <button className={btnGhost} onClick={() => setEditingKey(true)}>
                    {agent.has_api_key ? "Change API Key" : "Set API Key"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <textarea className={`${inp} flex-1`}
                  placeholder={isMcp ? "Paste MCP tool definitions JSON..." : "Paste Swagger/OpenAPI JSON or a URL (e.g. https://petstore.swagger.io/v2/swagger.json)"}
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

            {/* Endpoint list */}
            {agent.api_endpoints && agent.api_endpoints.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {isMcp ? "MCP Tools" : "API Endpoints"} ({agent.api_endpoints.length})
                </h4>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {agent.api_endpoints.map((ep, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-xs">
                      <span className={`font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                        ep.method === "GET" ? "bg-green-100 text-green-700" :
                        ep.method === "POST" ? "bg-blue-100 text-blue-700" :
                        ep.method === "PUT" ? "bg-amber-100 text-amber-700" :
                        ep.method === "DELETE" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{ep.method}</span>
                      <span className="font-mono text-text-primary">{ep.path}</span>
                      {ep.summary && <span className="text-gray-400 truncate">{ep.summary}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    uc.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                    uc.status === "tested" ? "bg-blue-100 text-blue-700" :
                    uc.status === "discovered" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>{uc.status}</span>
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

      {/* Section C: MCP Tools (persisted) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">MCP Tools</h3>
          <button
            className={btnPrimary}
            disabled={useCases.filter((uc) => uc.status === "completed").length === 0 || discoverToolsMut.isPending}
            onClick={() => discoverToolsMut.mutate(id!)}
          >
            {discoverToolsMut.isPending ? "Discovering..." : tools.length > 0 ? "Re-discover" : "Discover Tools"}
          </button>
        </div>
        {(() => {
          const ucNames: Record<string, string> = {};
          for (const uc of useCases) ucNames[uc.id] = uc.name;
          return tools.length > 0 ? (
            <div className="space-y-2">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} useCaseNames={ucNames} />
              ))}
              <p className="text-xs text-gray-400 mt-2">
                {tools.length} tool{tools.length !== 1 ? "s" : ""} &bull;{" "}
                {tools.filter((t) => t.status === "completed").length} completed &bull;{" "}
                {tools.filter((t) => t.status === "draft").length} draft &bull;{" "}
                {new Set(tools.flatMap((t) => t.use_case_ids)).size} use case{new Set(tools.flatMap((t) => t.use_case_ids)).size !== 1 ? "s" : ""} covered
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-3">
              {useCases.filter((uc) => uc.status === "completed").length > 0
                ? "Click 'Discover Tools' to generate MCP tool definitions from your completed use cases."
                : "Complete use cases first (draft \u2192 discovered \u2192 tested \u2192 completed), then discover tools."}
            </p>
          );
        })()}
      </div>

    </div>
  );
}
