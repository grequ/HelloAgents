import { useState } from "react";
import Chat from "./Chat";
import Trace from "./Trace";
import type { TraceStep } from "./types";

export default function DemoPage() {
  const [trace, setTrace] = useState<TraceStep[]>([]);

  return (
    <div className="max-w-[1500px] mx-auto flex flex-col" style={{ height: "calc(100vh - 56px - 48px)" }}>
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
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

      {/* Two-panel layout */}
      <div className="flex-1 grid grid-cols-[1fr_1.2fr] gap-4 overflow-hidden">
        <Chat onTrace={setTrace} />
        <Trace steps={trace} />
      </div>
    </div>
  );
}
