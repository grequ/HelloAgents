import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import DemoPage from "./DemoPage";
import WorkbenchLayout from "./components/WorkbenchLayout";
import Dashboard from "./workbench/Dashboard";
import AgentDetail from "./workbench/AgentDetail";
import Playground from "./workbench/Playground";
import AgentSpecList from "./workbench/AgentSpecList";
import AgentSpecView from "./workbench/AgentSpecView";
import AgentMap from "./workbench/AgentMap";

function SpecRedirect() {
  const { specId } = useParams();
  return <Navigate to={`/workbench/specs/${specId}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DemoPage />} />
        <Route element={<WorkbenchLayout />}>
          <Route path="/workbench" element={<Dashboard />} />
          <Route path="/workbench/agents/:id" element={<AgentDetail />} />
          <Route path="/workbench/agents/:id/usecases/:ucId" element={<Playground />} />
          <Route path="/workbench/specs" element={<AgentSpecList />} />
          <Route path="/workbench/specs/:id" element={<AgentSpecView />} />
          <Route path="/workbench/map" element={<AgentMap />} />
        </Route>
        {/* Redirects from old paths */}
        <Route path="/workbench/systems/:id" element={<Navigate to="/workbench" replace />} />
        <Route path="/workbench/agents" element={<Navigate to="/workbench/specs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
