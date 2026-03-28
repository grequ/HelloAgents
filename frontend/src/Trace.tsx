import type { TraceStep } from "./types";

const AGENT_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  support:   { bg: "bg-blue-50",   border: "border-blue-500",   icon: "\u{1F3A7}", label: "Support Orchestrator" },
  logistics: { bg: "bg-green-50",  border: "border-green-500",  icon: "\u{1F4E6}", label: "Logistics Agent" },
  payment:   { bg: "bg-amber-50",  border: "border-amber-400",  icon: "\u{1F4B3}", label: "Payment Agent" },
  system:    { bg: "bg-purple-50", border: "border-purple-500", icon: "\u{1F5A5}\uFE0F", label: "External System" },
};

const ACTION_LABELS: Record<string, string> = {
  received_message: "Received customer message",
  call_tool: "Delegating to agent",
  agent_start: "Agent activated",
  call_system: "Querying external system",
  system_response: "System responded",
  agent_response: "Agent composed answer",
  final_reply: "Final response to customer",
};

function truncateJson(detail: string): string {
  if (!detail || detail.length < 200) return detail;
  try {
    const parsed = JSON.parse(detail);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return detail;
  }
}

function StepCard({ step, index }: { step: TraceStep; index: number }) {
  const style = AGENT_STYLES[step.agent] || AGENT_STYLES.support;
  const depth = step.depth || 0;
  const isSystem = step.agent === "system";

  let detailContent = step.detail;
  if (isSystem && detailContent) {
    detailContent = truncateJson(detailContent);
  }

  return (
    <div
      className={`border-l-4 ${style.border} ${style.bg} rounded-r-lg px-4 py-3 animate-[fadeSlideIn_0.3s_ease_forwards] opacity-0`}
      style={{
        marginLeft: depth * 24,
        animationDelay: `${index * 0.12}s`,
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <span>{style.icon}</span>
        <span className="font-semibold text-gray-800">{style.label}</span>
        <span className="text-gray-500 text-xs">
          {ACTION_LABELS[step.action] || step.action}
        </span>
      </div>

      {step.tool && (
        <div className="mt-1.5 text-xs text-gray-600">
          <code className="bg-white/60 px-1.5 py-0.5 rounded text-xs font-mono">
            {step.system || step.tool}
          </code>
          {!!step.input?.question && (
            <span className="ml-1.5">&mdash; &ldquo;{String(step.input.question)}&rdquo;</span>
          )}
          {!!step.input?.order_id && !step.input?.question && (
            <span className="ml-1.5">&mdash; {String(step.input.order_id)}</span>
          )}
          {!!step.input?.tracking_number && (
            <span className="ml-1.5">&mdash; {String(step.input.tracking_number)}</span>
          )}
        </div>
      )}

      {detailContent && (
        <p
          className={`mt-2 text-xs leading-relaxed text-gray-700 ${
            isSystem
              ? "font-mono bg-white/60 rounded p-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap"
              : "whitespace-pre-wrap"
          }`}
        >
          {detailContent}
        </p>
      )}
    </div>
  );
}

interface TraceProps {
  steps: TraceStep[];
}

export default function Trace({ steps }: TraceProps) {
  if (steps.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-tedee-navy mb-4">Agent Orchestration Trace</h2>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 px-6">
          <pre className="text-sm leading-relaxed mb-6 font-mono whitespace-pre">{`
         Customer Message
               |
               v
  +---------------------------+
  |   Support Orchestrator    |  <-- AI decides who to ask
  |       (Claude LLM)        |
  +-----+---------------+-----+
        |               |
        v               v
  +-----------+   +------------+
  | Logistics |   |  Payment   |
  |   Agent   |   |   Agent    |
  | (Claude)  |   |  (Claude)  |
  +--+--+--+--+   +------------+
     |  |  |
     v  v  v
  +-----+ +-------+ +--------+
  | WMS | |Carrier| |Customs |
  +-----+ +-------+ +--------+`}</pre>
          <p className="text-base text-gray-500">Send a message to see the full orchestration trace.</p>
          <p className="text-sm mt-2 text-gray-300">
            Watch how the AI decides which agents and systems to query — no hardcoded rules.
          </p>
        </div>
      </div>
    );
  }

  const llmCalls = steps.filter(
    (s) => s.action === "agent_start" || s.action === "received_message",
  ).length;
  const systemCalls = steps.filter((s) => s.action === "call_system").length;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-lg font-bold text-tedee-navy mb-3">Agent Orchestration Trace</h2>

      <div className="flex gap-4 mb-4 text-sm text-gray-500">
        <span><strong className="text-text-primary">{steps.length}</strong> steps</span>
        <span><strong className="text-text-primary">{llmCalls}</strong> AI decisions</span>
        <span><strong className="text-text-primary">{systemCalls}</strong> system queries</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {steps.map((step, i) => (
          <StepCard key={i} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}
