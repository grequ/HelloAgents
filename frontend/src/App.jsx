import { useState } from "react";
import Chat from "./Chat";
import Trace from "./Trace";

export default function App() {
  const [trace, setTrace] = useState([]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>HelloAgents</h1>
          <span className="subtitle">Multi-Agent AI Orchestration Demo</span>
        </div>
        <div className="header-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "#4285f4" }} />
            Orchestrator
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "#34a853" }} />
            Agent
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "#9334e6" }} />
            External System
          </span>
        </div>
      </header>
      <div className="panels">
        <Chat onTrace={setTrace} />
        <Trace steps={trace} />
      </div>
    </div>
  );
}
