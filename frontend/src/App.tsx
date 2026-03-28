import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import WorkbenchLayout from "./components/WorkbenchLayout";
import Dashboard from "./workbench/Dashboard";
import OperatorDetail from "./workbench/OperatorDetail";
import OrchestratorDetail from "./workbench/OrchestratorDetail";
import Playground from "./workbench/Playground";
import AgentSpecList from "./workbench/AgentSpecList";
import AgentSpecView from "./workbench/AgentSpecView";
import AgentMap from "./workbench/AgentMap";
import DemoPage from "./DemoPage";
import { useAgent } from "./workbench/queries";

function AgentDetailRouter() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading } = useAgent(id!);

  if (isLoading || !agent) return <p className="text-sm text-gray-500">Loading...</p>;

  return agent.agent_role === "orchestrator"
    ? <OrchestratorDetail />
    : <OperatorDetail />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<WorkbenchLayout />}>
          <Route path="/workbench" element={<Dashboard />} />
          <Route path="/workbench/agents/:id" element={<AgentDetailRouter />} />
          <Route path="/workbench/agents/:id/usecases/:ucId" element={<Playground />} />
          <Route path="/workbench/specs" element={<AgentSpecList />} />
          <Route path="/workbench/specs/:id" element={<AgentSpecView />} />
          <Route path="/workbench/map" element={<AgentMap />} />
          <Route path="/workbench/demo" element={<DemoPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/workbench" replace />} />
        <Route path="*" element={<Navigate to="/workbench" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
