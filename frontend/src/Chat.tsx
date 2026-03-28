import { useState } from "react";
import type { TraceStep, ChatMessage } from "./types";

const EXAMPLES = [
  { label: "Simple tracking", text: "Where is my order ORD-001?" },
  {
    label: "Multi-agent",
    text: "What's the delivery status of ORD-001 and can I get the invoice?",
  },
  {
    label: "Complex — refund + logistics",
    text: "ORD-003 was delivered but I want a refund. Also, where exactly is ORD-001 right now?",
  },
  {
    label: "Warehouse status",
    text: "Has order ORD-002 been packed yet? When will it ship?",
  },
];

interface ChatProps {
  onTrace: (steps: TraceStep[]) => void;
}

export default function Chat({ onTrace }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text?: string) {
    const userMsg = text || input;
    if (!userMsg.trim()) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    onTrace([]);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
      onTrace(data.trace || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-lg font-bold text-tedee-navy mb-4">Customer Chat</h2>

      {/* Example chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs text-gray-500 self-center mr-1">Try these:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.text}
            className="text-left border border-gray-200 rounded-lg px-3 py-2 text-xs hover:border-tedee-cyan hover:bg-tedee-cyan/5 transition-colors disabled:opacity-50"
            disabled={loading}
            onClick={() => send(ex.text)}
          >
            <span className="font-semibold text-tedee-navy block">{ex.label}</span>
            <span className="text-gray-500">{ex.text}</span>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-4 py-3 ${
              m.role === "user"
                ? "ml-auto bg-tedee-cyan/10 text-tedee-navy"
                : "mr-auto bg-gray-50 text-text-primary"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">
              {m.role === "user" ? "Customer" : "Support Agent"}
            </span>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
        {loading && (
          <div className="mr-auto bg-gray-50 rounded-lg px-4 py-3 max-w-[85%]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">
              Support Agent
            </span>
            <p className="text-sm text-gray-500 animate-pulse">Orchestrating agents...</p>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-tedee-cyan focus:ring-1 focus:ring-tedee-cyan/30"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about an order (e.g. ORD-001, ORD-002, ORD-003)..."
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-2.5 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
