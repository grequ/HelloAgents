import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Chat from "./Chat";
import Trace from "./Trace";
import Dashboard from "./workbench/Dashboard";
import SystemDetail from "./workbench/SystemDetail";
import Playground from "./workbench/Playground";
import { SpecList, SpecDetail } from "./workbench/AgentSpecView";

function DemoPage() {
  const [trace, setTrace] = useState([]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>HelloAgents</h1>
          <span className="subtitle">Multi-Agent AI Orchestration Demo</span>
        </div>
        <div className="header-right">
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
          <Link to="/workbench" className="nav-link">Migration Workbench</Link>
        </div>
      </header>
      <div className="panels">
        <Chat onTrace={setTrace} />
        <Trace steps={trace} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DemoPage />} />
        <Route path="/workbench" element={<Dashboard />} />
        <Route path="/workbench/systems/:id" element={<SystemDetail />} />
        <Route path="/workbench/systems/:id/usecases/:ucId" element={<Playground />} />
        <Route path="/workbench/specs" element={<SpecList />} />
        <Route path="/workbench/specs/:specId" element={<SpecDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
