import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import WorkbenchLayout from "./components/WorkbenchLayout";
import Dashboard from "./workbench/Dashboard";
import AgentDetail from "./workbench/AgentDetail";
import Playground from "./workbench/Playground";
import AgentSpecList from "./workbench/AgentSpecList";
import AgentSpecView from "./workbench/AgentSpecView";
import AgentMap from "./workbench/AgentMap";
import DemoPage from "./DemoPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<WorkbenchLayout />}>
          <Route path="/workbench" element={<Dashboard />} />
          <Route path="/workbench/agents/:id" element={<AgentDetail />} />
          <Route path="/workbench/agents/:id/usecases/:ucId" element={<Playground />} />
          <Route path="/workbench/specs" element={<AgentSpecList />} />
          <Route path="/workbench/specs/:id" element={<AgentSpecView />} />
          <Route path="/workbench/map" element={<AgentMap />} />
          <Route path="/workbench/demo" element={<DemoPage />} />
        </Route>
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/workbench" replace />} />
        <Route path="*" element={<Navigate to="/workbench" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
