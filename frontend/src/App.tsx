import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import DemoPage from "./DemoPage";
import WorkbenchLayout from "./components/WorkbenchLayout";
import Dashboard from "./workbench/Dashboard";
import SystemDetail from "./workbench/SystemDetail";
import Playground from "./workbench/Playground";
import AgentSpecList from "./workbench/AgentSpecList";
import AgentSpecView from "./workbench/AgentSpecView";

function SpecRedirect() {
  const { specId } = useParams();
  return <Navigate to={`/workbench/agents/${specId}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DemoPage />} />
        <Route element={<WorkbenchLayout />}>
          <Route path="/workbench" element={<Dashboard />} />
          <Route path="/workbench/systems/:id" element={<SystemDetail />} />
          <Route path="/workbench/systems/:id/usecases/:ucId" element={<Playground />} />
          <Route path="/workbench/agents" element={<AgentSpecList />} />
          <Route path="/workbench/agents/:id" element={<AgentSpecView />} />
        </Route>
        {/* Redirects from old paths */}
        <Route path="/workbench/specs" element={<Navigate to="/workbench/agents" replace />} />
        <Route path="/workbench/specs/:specId" element={<SpecRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
