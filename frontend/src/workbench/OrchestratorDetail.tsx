import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { AgentConfig, InteractionAsk, SpecConfig, Agent } from "../types";
import {
  useAgent, useUseCases, useInteractions, useOperators,
  useDeleteUseCase, useDeleteAgent,
  useGenerateSpec, useSaveAgentConfig, useSaveInteractions,
} from "./queries";
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

// --- Helper: describe operator capabilities ---

function operatorCapsSummary(op: Agent): string | null {
  if (op.has_api_spec && op.api_spec_endpoint_count) {
    return `${op.api_spec_endpoint_count} endpoints`;
  }
  return null;
}

// --- Component ---

export default function OrchestratorDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: agent, isLoading: agentLoading } = useAgent(id!);
  const { data: useCases = [], isLoading: ucLoading } = useUseCases(id!);
  const { data: interactions } = useInteractions(id!);
  const { data: operators = [] } = useOperators();

  const deleteUc = useDeleteUseCase();
  const deleteAg = useDeleteAgent();
  const genSpec = useGenerateSpec();
  const saveConfig = useSaveAgentConfig();
  const saveInteractionsMut = useSaveInteractions();

  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // --- Config state (Section B: Behavior) ---
  const [config, setConfig] = useState({
    agent_name: "",
    agent_persona: "",
    additional_context: "",
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // --- Connected operators state (Section A) ---
  const [connectedOps, setConnectedOps] = useState<InteractionAsk[]>([]);
  const [interactionsLoaded, setInteractionsLoaded] = useState(false);

  // Load config from agent
  useEffect(() => {
    if (!agent || configLoaded) return;
    const c = agent.agent_config;
    setConfig({
      agent_name: c?.agent_name || agent.name + " Orchestrator",
      agent_persona: c?.agent_persona || "",
      additional_context: c?.additional_context || "",
    });
    setConfigLoaded(true);
  }, [agent, configLoaded]);

  // Load connected operators from interactions.asks
  useEffect(() => {
    if (!interactions || interactionsLoaded) return;
    setConnectedOps(interactions.asks.map((a) => ({
      target_agent_id: a.target_agent_id,
      target_agent_name: a.target_agent_name,
      use_case_ids: a.use_case_ids,
    })));
    setInteractionsLoaded(true);
  }, [interactions, interactionsLoaded]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // --- Available operators (exclude self and already-connected) ---
  const availableOperators = operators.filter(
    (op) => op.id !== id && !connectedOps.some((c) => c.target_agent_id === op.id)
  );

  // --- Connected operator helpers ---

  function addOperator() {
    if (availableOperators.length === 0) return;
    const op = availableOperators[0];
    setConnectedOps([...connectedOps, { target_agent_id: op.id, target_agent_name: op.name, use_case_ids: [] }]);
    setDirty(true);
  }

  function updateOperator(idx: number, opId: string) {
    const op = operators.find((o) => o.id === opId);
    if (!op) return;
    const updated = [...connectedOps];
    updated[idx] = { target_agent_id: op.id, target_agent_name: op.name, use_case_ids: [] };
    setConnectedOps(updated);
    setDirty(true);
  }

  function removeOperator(idx: number) {
    setConnectedOps(connectedOps.filter((_, i) => i !== idx));
    setDirty(true);
  }

  // --- Save ---

  const handleSave = async () => {
    const errors: string[] = [];

    // Save config
    try {
      const agentConfig: AgentConfig = {
        agent_name: config.agent_name,
        tech_stack: agent?.agent_config?.tech_stack || "Python 3.11",
        framework: agent?.agent_config?.framework || "FastAPI + anthropic SDK",
        agent_persona: config.agent_persona,
        deployment: agent?.agent_config?.deployment || "Standalone microservice (Docker)",
        error_handling: agent?.agent_config?.error_handling || "Retry once on 5xx, return graceful error message to user on failure",
        auth_notes: agent?.agent_config?.auth_notes || "",
        additional_context: config.additional_context,
      };
      await saveConfig.mutateAsync({ id: id!, config: agentConfig });
    } catch (e: unknown) {
      errors.push("Config: " + (e instanceof Error ? e.message : "unknown error"));
    }

    // Save interactions (connected operators stored as asks)
    try {
      await saveInteractionsMut.mutateAsync({
        agentId: id!,
        asks: connectedOps.map((c) => ({ target_agent_id: c.target_agent_id, use_case_ids: c.use_case_ids })),
        provides_to: [],
      });
    } catch (e: unknown) {
      errors.push("Interactions: " + (e instanceof Error ? e.message : "unknown error"));
    }

    if (errors.length > 0) {
      alert("Save failed:\n" + errors.join("\n"));
    } else {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const isSaving = saveConfig.isPending || saveInteractionsMut.isPending;

  // --- Generate ---

  const handleGenerate = async () => {
    await handleSave();

    const interactionLines: string[] = connectedOps.map((c) =>
      `This orchestrator delegates to: ${c.target_agent_name} Agent`
    );

    const specConfig: SpecConfig = {
      tech_stack: agent?.agent_config?.tech_stack || "Python 3.11",
      framework: agent?.agent_config?.framework || "FastAPI + anthropic SDK",
      agent_role: "orchestrator",
      deployment: agent?.agent_config?.deployment || "Standalone microservice (Docker)",
      interactions: interactionLines.join("\n") || "",
      error_handling: agent?.agent_config?.error_handling || "Retry once on 5xx, return graceful error message to user on failure",
      auth_notes: agent?.agent_config?.auth_notes || "",
      additional_context: config.additional_context,
    };

    try {
      const spec = await genSpec.mutateAsync({
        agentName: config.agent_name || agent!.name + " Orchestrator",
        agentIds: [id!],
        useCaseIds: useCases.map((u) => u.id),
        config: specConfig,
      });
      nav(`/workbench/specs/${spec.id}`);
    } catch (e: unknown) {
      alert("Generation failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  // --- Render ---

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
          <button className={btnPrimary} onClick={handleSave} disabled={isSaving || !dirty}>
            {saved ? "Saved!" : dirty ? "\u25CF Save" : "Save"}
          </button>
          {dirty && <button className={btnSecondary} onClick={() => { window.location.reload(); }}>Cancel</button>}
          <button className={btnSecondary} onClick={handleGenerate} disabled={genSpec.isPending}>
            {genSpec.isPending ? "Generating..." : "Generate"}
          </button>
          <button className={btnDanger} onClick={async () => { if (confirm("Delete this orchestrator and all its use cases?")) { await deleteAg.mutateAsync(id!); nav("/workbench"); } }}>
            Delete
          </button>
        </div>
      </div>

      {/* Section A: Connected Operators */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-4">Connected Operators</h3>
        <div className="space-y-2">
          {connectedOps.map((conn, idx) => {
            const usedIds = connectedOps.filter((_, i) => i !== idx).map((c) => c.target_agent_id);
            const options = operators.filter((op) => op.id !== id && !usedIds.includes(op.id));
            const selectedOp = operators.find((op) => op.id === conn.target_agent_id);
            const caps = selectedOp ? operatorCapsSummary(selectedOp) : null;

            return (
              <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-2 text-sm">
                  <select className={`${inp} w-auto flex-1`} value={conn.target_agent_id} onChange={(e) => updateOperator(idx, e.target.value)}>
                    {options.map((op) => <option key={op.id} value={op.id}>{op.name}</option>)}
                  </select>
                  <button className={btnGhostDanger} onClick={() => removeOperator(idx)}>Remove</button>
                </div>
                {caps && (
                  <p className="text-xs text-gray-500 ml-1">{caps}</p>
                )}
                {selectedOp && selectedOp.has_api_spec && selectedOp.api_spec_endpoint_count && (
                  <div className="flex flex-wrap gap-1.5 ml-1 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-tedee-cyan/10 text-tedee-navy font-medium">
                      {selectedOp.api_type === "mcp" ? "MCP" : selectedOp.api_type?.toUpperCase() || "REST"}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                      {selectedOp.api_spec_endpoint_count} {selectedOp.api_type === "mcp" ? "tools" : "endpoints"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {connectedOps.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No operators connected yet. Connect operators that this orchestrator can delegate to.</p>
          )}
        </div>
        {availableOperators.length > 0 ? (
          <button className={`${btnGhost} mt-3`} onClick={addOperator}>+ Connect Operator</button>
        ) : operators.filter((op) => op.id !== id).length === 0 ? (
          <p className="text-xs text-gray-400 mt-3">No operators available. Create operator agents first.</p>
        ) : connectedOps.length > 0 ? (
          <p className="text-xs text-gray-400 mt-3">All available operators connected.</p>
        ) : null}
      </div>

      {/* Section B: Behavior */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-3">Behavior</h3>
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Agent Name</label>
          <input className={inp} value={config.agent_name} onChange={(e) => { setConfig({ ...config, agent_name: e.target.value }); setDirty(true); }} />
        </div>
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Agent Persona</label>
          <AutoTextarea className={inp} value={config.agent_persona} onChange={(v) => { setConfig({ ...config, agent_persona: v }); setDirty(true); }} placeholder="Describe the orchestrator's role and persona..." />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Additional Context</label>
          <AutoTextarea className={inp} value={config.additional_context} onChange={(v) => { setConfig({ ...config, additional_context: v }); setDirty(true); }} placeholder="Routing rules, escalation policies, business rules..." />
        </div>
      </div>

      {/* Section C: Use Cases */}
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
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{uc.status}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{uc.trigger_text || uc.description}</p>
              <div className="flex gap-2">
                <Link to={`/workbench/agents/${id}/usecases/${uc.id}`} className={btnGhostCyan}>Open Playground</Link>
                <button className={btnGhostDanger} onClick={async () => { if (confirm("Delete this use case?")) await deleteUc.mutateAsync(uc.id); }}>Delete</button>
              </div>
            </div>
          ))}
          {useCases.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No use cases yet. Define orchestration scenarios for this agent.</p>}
        </div>
      </div>
    </div>
  );
}
