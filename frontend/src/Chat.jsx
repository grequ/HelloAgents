import { useState } from "react";

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

export default function Chat({ onTrace }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text) {
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
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel chat-panel">
      <h2>Customer Chat</h2>

      <div className="examples">
        <span className="examples-label">Try these:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.text}
            className="chip"
            disabled={loading}
            onClick={() => send(ex.text)}
          >
            <span className="chip-label">{ex.label}</span>
            <span className="chip-text">{ex.text}</span>
          </button>
        ))}
      </div>

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <span className="msg-label">
              {m.role === "user" ? "Customer" : "Support Agent"}
            </span>
            <p>{m.text}</p>
          </div>
        ))}
        {loading && (
          <div className="msg msg-assistant loading">
            <span className="msg-label">Support Agent</span>
            <p className="dots">
              Orchestrating agents<span className="dot-anim">...</span>
            </p>
          </div>
        )}
      </div>

      <form
        className="input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about an order (e.g. ORD-001, ORD-002, ORD-003)..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
