import { useState } from "react";
import { Link } from "react-router-dom";
import Chat from "./Chat";
import Trace from "./Trace";
import type { TraceStep } from "./types";

export default function DemoPage() {
  const [trace, setTrace] = useState<TraceStep[]>([]);

  return (
    <div className="flex flex-col h-screen max-w-[1500px] mx-auto font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-tedee-navy">HelloAgents</h1>
          <span className="text-sm text-gray-400">Multi-Agent AI Orchestration Demo</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Orchestrator
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              Agent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              External System
            </span>
          </div>
          <Link
            to="/workbench"
            className="px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan transition-colors"
          >
            Migration Workbench
          </Link>
        </div>
      </header>

      {/* Two-panel layout */}
      <div className="flex-1 grid grid-cols-[1fr_1.2fr] gap-4 p-4 bg-bg-light overflow-hidden">
        <Chat onTrace={setTrace} />
        <Trace steps={trace} />
      </div>
    </div>
  );
}
