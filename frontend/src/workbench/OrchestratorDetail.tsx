import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { AgentConfig, InteractionAsk, SpecConfig, Agent } from "../types";
import {
  useAgent, useUseCases, useInteractions, useOperators, useAllTools,
  useDeleteUseCase, useDeleteAgent,
  useGenerateSpec, useSaveAgentConfig, useSaveInteractions,
} from "./queries";
import { suggestUseCase } from "./api";
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

// --- Component ---

export default function OrchestratorDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: agent, isLoading: agentLoading } = useAgent(id!);
  const { data: useCases = [], isLoading: ucLoading } = useUseCases(id!);
  const { data: interactions } = useInteractions(id!);
  const { data: operators = [] } = useOperators();
  const { data: allTools = [] } = useAllTools();

  const deleteUc = useDeleteUseCase();
  const deleteAg = useDeleteAgent();
  const genSpec = useGenerateSpec();
  const saveConfig = useSaveAgentConfig();
  const saveInteractionsMut = useSaveInteractions();

  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [improving, setImproving] = useState<"persona" | "context" | null>(null);

  // Config state
  const [config, setConfig] = useState({ agent_name: "", agent_persona: "", additional_context: "" });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Connected operators
  const [connectedOps, setConnectedOps] = useState<InteractionAsk[]>([]);
  const [interactionsLoaded, setInteractionsLoaded] = useState(false);

  // Load config
  useEffect(() => {
    if (!agent || configLoaded) return;
    const c = agent.agent_config;
    setConfig({
      agent_name: c?.agent_name || agent.name,
      agent_persona: c?.agent_persona || "",
      additional_context: c?.additional_context || "",
    });
    setConfigLoaded(true);
  }, [agent, configLoaded]);

  // Load connected operators
  useEffect(() => {
    if (!interactions || interactionsLoaded) return;
    setConnectedOps(interactions.asks.map((a) => ({
      target_agent_id: a.target_agent_id,
      target_agent_name: a.target_agent_name,
      use_case_ids: a.use_case_ids,
    })));
    setInteractionsLoaded(true);
  }, [interactions, interactionsLoaded]);

  // beforeunload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Tools grouped by operator
  const toolsByOperator = new Map<string, { name: string; description: string }[]>();
  for (const tool of allTools) {
    const list = toolsByOperator.get(tool.agent_id) || [];
    list.push({ name: tool.name, description: tool.description });
    toolsByOperator.set(tool.agent_id, list);
  }

  const availableOperators = operators.filter(
    (op) => op.id !== id && !connectedOps.some((c) => c.target_agent_id === op.id)
  );

  // --- Operators ---

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

  // --- AI Improve ---

  const handleImprove = async (field: "persona" | "context") => {
    setImproving(field);
    try {
      const currentValue = field === "persona" ? config.agent_persona : config.additional_context;
      const operatorNames = connectedOps.map((c) => c.target_agent_name).join(", ");
      const toolNames = connectedOps.flatMap((c) => (toolsByOperator.get(c.target_agent_id) || []).map((t) => t.name)).join(", ");

      const prompt = field === "persona"
        ? `Improve this agent persona for an orchestrator named "${config.agent_name}" that connects to operators: ${operatorNames}. Available tools: ${toolNames}. Use cases: ${useCases.map((u) => u.name).join(", ")}.\n\nCurrent persona:\n${currentValue || "(empty)"}\n\nWrite a clear, specific persona following best practices: define the role, boundaries, tone, what it can/cannot do, how it decides which operator to call, error handling behavior. Be concise but complete.`
        : `Improve this additional context for an orchestrator named "${config.agent_name}" that connects to operators: ${operatorNames}. Available tools: ${toolNames}.\n\nCurrent context:\n${currentValue || "(empty)"}\n\nAdd relevant details: routing logic between operators, escalation rules, rate limits, business constraints, data handling policies. Be specific and actionable.`;

      const suggestion = await suggestUseCase(id!, "improve-" + field, prompt);
      const improved = suggestion.trigger_text || suggestion.expected_output || "";
      if (improved) {
        if (field === "persona") setConfig({ ...config, agent_persona: improved });
        else setConfig({ ...config, additional_context: improved });
        setDirty(true);
      }
    } catch (e: unknown) {
      alert("Improve failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setImproving(null);
    }
  };

  // --- Save ---

  const handleSave = async () => {
    const errors: string[] = [];
    try {
      const agentConfig: AgentConfig = {
        agent_name: config.agent_name,
        tech_stack: "", framework: "", deployment: "",
        error_handling: "", auth_notes: "",
        agent_persona: config.agent_persona,
        additional_context: config.additional_context,
      };
      await saveConfig.mutateAsync({ id: id!, config: agentConfig });
    } catch (e: unknown) { errors.push("Config: " + (e instanceof Error ? e.message : "unknown")); }

    try {
      await saveInteractionsMut.mutateAsync({
        agentId: id!,
        asks: connectedOps.map((c) => ({ target_agent_id: c.target_agent_id, use_case_ids: c.use_case_ids })),
        provides_to: [],
      });
    } catch (e: unknown) { errors.push("Interactions: " + (e instanceof Error ? e.message : "unknown")); }

    if (errors.length > 0) { alert("Save failed:\n" + errors.join("\n")); }
    else { setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  const isSaving = saveConfig.isPending || saveInteractionsMut.isPending;

  // --- Generate ---

  const handleGenerate = async () => {
    await handleSave();
    const interactionLines = connectedOps.map((c) => {
      const tools = toolsByOperator.get(c.target_agent_id) || [];
      return `Delegates to: ${c.target_agent_name} (tools: ${tools.map((t) => t.name).join(", ") || "none"})`;
    });

    try {
      const spec = await genSpec.mutateAsync({
        agentName: config.agent_name || agent!.name,
        agentIds: [id!],
        useCaseIds: useCases.map((u) => u.id),
        config: {
          agent_role: "orchestrator",
          interactions: interactionLines.join("\n"),
          additional_context: config.additional_context,
        } as SpecConfig,
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
          <button className={btnPrimary} onClick={handleSave} disabled={isSaving || !dirty}>
            {saved ? "Saved!" : dirty ? "\u25CF Save" : "Save"}
          </button>
          {dirty && <button className={btnSecondary} onClick={() => window.location.reload()}>Cancel</button>}
          <button className={btnSecondary} onClick={handleGenerate} disabled={genSpec.isPending}>
            {genSpec.isPending ? "Generating..." : "Generate"}
          </button>
          <button className={btnDanger} onClick={async () => { if (confirm("Delete this orchestrator?")) { await deleteAg.mutateAsync(id!); nav("/workbench"); } }}>
            Delete
          </button>
        </div>
      </div>

      {/* Section A: Behavior (moved to top) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-3">Behavior</h3>
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Agent Name</label>
          <input className={inp} value={config.agent_name} onChange={(e) => { setConfig({ ...config, agent_name: e.target.value }); setDirty(true); }} />
        </div>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-gray-500">Agent Persona</label>
            <button className={btnGhost} onClick={() => handleImprove("persona")} disabled={improving === "persona"}>
              {improving === "persona" ? "Improving..." : "Improve with AI"}
            </button>
          </div>
          <AutoTextarea className={inp} value={config.agent_persona} onChange={(v) => { setConfig({ ...config, agent_persona: v }); setDirty(true); }}
            placeholder={"Define this orchestrator's role, boundaries, and decision-making logic.\n\nExample:\nYou are the Customer Support Orchestrator. You route customer inquiries to the appropriate operator based on intent. For product questions, delegate to ProductCatalog. For order issues, delegate to OrderManagement. Always confirm the customer's intent before delegating. If uncertain, ask a clarifying question. Never expose internal system details."} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-gray-500">Additional Context</label>
            <button className={btnGhost} onClick={() => handleImprove("context")} disabled={improving === "context"}>
              {improving === "context" ? "Improving..." : "Improve with AI"}
            </button>
          </div>
          <AutoTextarea className={inp} value={config.additional_context} onChange={(v) => { setConfig({ ...config, additional_context: v }); setDirty(true); }}
            placeholder={"Routing rules, escalation policies, business constraints.\n\nExample:\n- Route to PhoneValidator for any phone-related queries\n- Escalate to human if confidence < 80%\n- Max 3 operator calls per user request\n- Log all routing decisions for audit"} />
        </div>
      </div>

      {/* Section B: Connected Operators (below behavior) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-text-primary mb-4">Connected Operators</h3>
        <div className="space-y-3">
          {connectedOps.map((conn, idx) => {
            const usedIds = connectedOps.filter((_, i) => i !== idx).map((c) => c.target_agent_id);
            const options = operators.filter((op) => op.id !== id && !usedIds.includes(op.id));
            const tools = toolsByOperator.get(conn.target_agent_id) || [];

            return (
              <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <select className={`${inp} w-auto flex-1`} value={conn.target_agent_id} onChange={(e) => updateOperator(idx, e.target.value)}>
                    {options.map((op) => <option key={op.id} value={op.id}>{op.name}</option>)}
                  </select>
                  <button className={btnGhostDanger} onClick={() => removeOperator(idx)}>Remove</button>
                </div>
                {tools.length > 0 ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">{tools.length} tool{tools.length !== 1 ? "s" : ""} available:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tools.map((t, ti) => (
                        <span key={ti} className="text-[11px] font-mono px-2 py-1 rounded bg-white border border-gray-200 text-tedee-navy" title={t.description}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No tools discovered yet. Complete use cases and discover tools on this operator first.</p>
                )}
              </div>
            );
          })}
          {connectedOps.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No operators connected. Connect operators that this orchestrator delegates to.</p>
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
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  uc.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                  uc.status === "tested" || uc.status === "discovered" ? "bg-blue-100 text-blue-700" :
                  "bg-amber-100 text-amber-700"
                }`}>{uc.status}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{uc.trigger_text || uc.description}</p>
              <div className="flex gap-2">
                <Link to={`/workbench/agents/${id}/usecases/${uc.id}`} className={btnGhostCyan}>Open Playground</Link>
                <button className={btnGhostDanger} onClick={async () => { if (confirm("Delete this use case?")) await deleteUc.mutateAsync(uc.id); }}>Delete</button>
              </div>
            </div>
          ))}
          {useCases.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No use cases yet. Define orchestration scenarios.</p>}
        </div>
      </div>
    </div>
  );
}
