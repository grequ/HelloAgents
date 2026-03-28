const AGENT_STYLES = {
  support: { bg: "#e8f0fe", border: "#4285f4", icon: "🎧", label: "Support Orchestrator" },
  logistics: { bg: "#e6f4ea", border: "#34a853", icon: "📦", label: "Logistics Agent" },
  payment: { bg: "#fef7e0", border: "#f9ab00", icon: "💳", label: "Payment Agent" },
  system: { bg: "#f3e8fd", border: "#9334e6", icon: "🖥️", label: "External System" },
};

const ACTION_LABELS = {
  received_message: "Received customer message",
  call_tool: "Delegating to agent",
  agent_start: "Agent activated",
  call_system: "Querying external system",
  system_response: "System responded",
  agent_response: "Agent composed answer",
  final_reply: "Final response to customer",
};

function truncateJson(detail) {
  if (!detail || detail.length < 200) return detail;
  try {
    const parsed = JSON.parse(detail);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return detail;
  }
}

function TraceStep({ step, index }) {
  const style = AGENT_STYLES[step.agent] || AGENT_STYLES.support;
  const depth = step.depth || 0;
  const isSystem = step.agent === "system";
  const isExpanded = isSystem && step.detail;

  let detailContent = step.detail;
  if (isSystem && detailContent) {
    detailContent = truncateJson(detailContent);
  }

  return (
    <div
      className={`trace-step depth-${depth}`}
      style={{
        background: style.bg,
        borderLeft: `4px solid ${style.border}`,
        marginLeft: depth * 24,
        animationDelay: `${index * 0.12}s`,
      }}
    >
      <div className="trace-header">
        <span className="trace-icon">{style.icon}</span>
        <span className="trace-agent">{style.label}</span>
        <span className="trace-action">
          {ACTION_LABELS[step.action] || step.action}
        </span>
      </div>

      {step.tool && (
        <div className="trace-tool">
          <code>{step.system || step.tool}</code>
          {step.input && step.input.question && (
            <span className="trace-input"> — "{step.input.question}"</span>
          )}
          {step.input && step.input.order_id && !step.input.question && (
            <span className="trace-input"> — {step.input.order_id}</span>
          )}
          {step.input && step.input.tracking_number && (
            <span className="trace-input"> — {step.input.tracking_number}</span>
          )}
        </div>
      )}

      {detailContent && (
        <p className={`trace-detail ${isExpanded ? "trace-json" : ""}`}>
          {detailContent}
        </p>
      )}
    </div>
  );
}

export default function Trace({ steps }) {
  if (steps.length === 0) {
    return (
      <div className="panel trace-panel">
        <h2>Agent Orchestration Trace</h2>
        <div className="trace-empty">
          <div className="architecture-diagram">
            <h3>Architecture</h3>
            <pre>{`
  Customer Message
        │
        ▼
  ┌─────────────────────┐
  │  Support Orchestrator│  ← AI decides who to ask
  │  (Claude LLM)       │
  └──┬──────────────┬───┘
     │              │
     ▼              ▼
  ┌────────┐   ┌─────────┐
  │Logistics│   │ Payment │
  │  Agent  │   │  Agent  │
  │(Claude) │   │(Claude) │
  └┬──┬──┬─┘   └─────────┘
   │  │  │
   ▼  ▼  ▼
  ┌──┐┌──┐┌──┐
  │WMS││📡││🛃│  ← Real systems
  └──┘└──┘└──┘
  SAP  Carrier Customs
            `}</pre>
          </div>
          <p>Send a message to see the full orchestration trace.</p>
          <p className="trace-hint">
            Watch how the AI decides which agents and systems to query — no hardcoded rules.
          </p>
        </div>
      </div>
    );
  }

  // Count stats for the summary bar
  const llmCalls = steps.filter(
    (s) => s.action === "agent_start" || s.action === "received_message"
  ).length;
  const systemCalls = steps.filter((s) => s.action === "call_system").length;

  return (
    <div className="panel trace-panel">
      <h2>Agent Orchestration Trace</h2>
      <div className="trace-stats">
        <span className="stat">
          <strong>{steps.length}</strong> steps
        </span>
        <span className="stat">
          <strong>{llmCalls}</strong> AI decisions
        </span>
        <span className="stat">
          <strong>{systemCalls}</strong> system queries
        </span>
      </div>
      <div className="timeline">
        {steps.map((step, i) => (
          <TraceStep key={i} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}
