import { useState } from "react";
import { Link } from "react-router-dom";
import type { Agent, ConnectionResult } from "../types";
import { useDashboard, useCreateAgent, useSeedDemoData, useSetApiKey, useSpecs } from "./queries";
import { testUrl } from "./api";
import { btnPrimary, btnSecondary, btnGhost, inp } from "./ui";

const STATUS_COLORS: Record<string, string> = {
  inventoried: "bg-gray-200 text-gray-700",
  api_documented: "bg-blue-100 text-blue-700",
  use_cases_defined: "bg-green-100 text-green-700",
  tested: "bg-amber-100 text-amber-700",
  spec_generated: "bg-emerald-100 text-emerald-700",
};

type RoleTab = "operator" | "orchestrator";

const EMPTY_OPERATOR_FORM = {
  name: "", description: "", category: "", owner_team: "",
  api_type: "rest", api_base_url: "", api_key: "",
};

const EMPTY_ORCHESTRATOR_FORM = {
  name: "", description: "",
};

export default function Dashboard() {
  const { data, isLoading } = useDashboard();
  const specsQuery = useSpecs();
  const createAgent = useCreateAgent();
  const setApiKey = useSetApiKey();
  const seedDemo = useSeedDemoData();

  const [showForm, setShowForm] = useState(false);
  const [roleTab, setRoleTab] = useState<RoleTab>("operator");
  const [opForm, setOpForm] = useState({ ...EMPTY_OPERATOR_FORM });
  const [orchForm, setOrchForm] = useState({ ...EMPTY_ORCHESTRATOR_FORM });
  const [connResult, setConnResult] = useState<ConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);

  const agents: Agent[] = data?.agents || [];
  const stats = data?.stats || { agents: {}, use_cases: {}, specs_total: 0 };
  const operators = agents.filter((a) => a.agent_role === "operator");
  const orchestrators = agents.filter((a) => a.agent_role === "orchestrator");
  const ucTotal = Object.values(stats.use_cases).reduce((a, b) => a + b, 0);
  const specsTotal = specsQuery.data?.length ?? stats.specs_total;

  // Operator form logic
  const connectionOk = connResult?.ok === true;
  const opCanCreate = opForm.name.trim().length > 0 && connectionOk;

  // Orchestrator form logic
  const orchCanCreate = orchForm.name.trim().length > 0;

  const handleTestConnection = async () => {
    if (!opForm.api_base_url.trim()) return;
    setTesting(true);
    setConnResult(null);
    try {
      const result = await testUrl(opForm.api_base_url, opForm.api_key, "bearer");
      setConnResult(result);
    } catch (e: unknown) {
      setConnResult({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setTesting(false);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const agent = await createAgent.mutateAsync({
        name: opForm.name,
        description: opForm.description,
        category: opForm.category,
        owner_team: opForm.owner_team,
        agent_role: "operator",
        api_type: opForm.api_type,
        api_base_url: opForm.api_base_url,
      });
      if (opForm.api_key.trim()) {
        await setApiKey.mutateAsync({ id: agent.id, apiKey: opForm.api_key });
      }
      setOpForm({ ...EMPTY_OPERATOR_FORM });
      setConnResult(null);
      setShowForm(false);
    } catch (e: unknown) {
      alert("Create failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleCreateOrchestrator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAgent.mutateAsync({
        name: orchForm.name,
        description: orchForm.description,
        agent_role: "orchestrator",
        api_type: "none",
      });
      setOrchForm({ ...EMPTY_ORCHESTRATOR_FORM });
      setShowForm(false);
    } catch (e: unknown) {
      alert("Create failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  if (isLoading) return <p className="p-6 text-sm text-gray-500">Loading...</p>;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Operators", value: operators.length },
          { label: "Orchestrators", value: orchestrators.length },
          { label: "Use Cases", value: ucTotal },
          { label: "Specs", value: specsTotal },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
            <div className="text-3xl font-bold text-text-primary">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Agents</h2>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}>+ Add</button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
          {/* Role toggle */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              type="button"
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                roleTab === "operator" ? "bg-white shadow-sm text-tedee-navy" : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => { setRoleTab("operator"); setConnResult(null); }}
            >
              Operator
            </button>
            <button
              type="button"
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                roleTab === "orchestrator" ? "bg-white shadow-sm text-tedee-navy" : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => { setRoleTab("orchestrator"); setConnResult(null); }}
            >
              Orchestrator
            </button>
          </div>

          {roleTab === "operator" ? (
            <form className="space-y-3" onSubmit={handleCreateOperator}>
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} placeholder="Agent name *" required value={opForm.name}
                  onChange={(e) => setOpForm({ ...opForm, name: e.target.value })} />
                <input className={inp} placeholder="Category (e.g. logistics, finance)" value={opForm.category}
                  onChange={(e) => setOpForm({ ...opForm, category: e.target.value })} />
              </div>
              <input className={inp} placeholder="Description" value={opForm.description}
                onChange={(e) => setOpForm({ ...opForm, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} placeholder="Owner team" value={opForm.owner_team}
                  onChange={(e) => setOpForm({ ...opForm, owner_team: e.target.value })} />
                <select className={inp} value={opForm.api_type}
                  onChange={(e) => { setOpForm({ ...opForm, api_type: e.target.value }); setConnResult(null); }}>
                  <option value="rest">REST API</option>
                  <option value="graphql">GraphQL</option>
                  <option value="soap">SOAP</option>
                  <option value="grpc">gRPC</option>
                  <option value="database">Database</option>
                </select>
              </div>
              <input className={inp}
                placeholder="API Base URL (e.g. https://api.example.com/v1)"
                value={opForm.api_base_url}
                onChange={(e) => { setOpForm({ ...opForm, api_base_url: e.target.value }); setConnResult(null); }} />
              <input className={inp} type="password"
                placeholder="API Key (optional)"
                value={opForm.api_key}
                onChange={(e) => setOpForm({ ...opForm, api_key: e.target.value })} />

              <div className="flex items-center gap-3">
                <button type="button" className={btnGhost}
                  onClick={handleTestConnection}
                  disabled={testing || !opForm.api_base_url.trim()}>
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                {connResult && (
                  <span className={`text-xs font-medium ${connResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {connResult.ok ? `Connected (${connResult.status_code})` : `Failed${connResult.status_code ? ` (${connResult.status_code})` : ""}${connResult.error ? `: ${connResult.error}` : ""}`}
                  </span>
                )}
                {!connResult && !testing && opForm.api_base_url.trim() && (
                  <span className="text-xs text-amber-600">Test connection before creating</span>
                )}
              </div>

              <div className="flex gap-2 items-center">
                <button type="submit" className={btnPrimary} disabled={createAgent.isPending || !opCanCreate}>
                  {createAgent.isPending ? "Creating..." : "Create"}
                </button>
                <button type="button" className={btnSecondary}
                  onClick={() => { setShowForm(false); setOpForm({ ...EMPTY_OPERATOR_FORM }); setConnResult(null); }}>
                  Cancel
                </button>
                {!connectionOk && opForm.api_base_url.trim() && (
                  <span className="text-xs text-gray-400">Test connection to enable Create</span>
                )}
              </div>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={handleCreateOrchestrator}>
              <input className={inp} placeholder="Agent name *" required value={orchForm.name}
                onChange={(e) => setOrchForm({ ...orchForm, name: e.target.value })} />
              <input className={inp} placeholder="Description" value={orchForm.description}
                onChange={(e) => setOrchForm({ ...orchForm, description: e.target.value })} />

              <div className="flex gap-2 items-center">
                <button type="submit" className={btnPrimary} disabled={createAgent.isPending || !orchCanCreate}>
                  {createAgent.isPending ? "Creating..." : "Create"}
                </button>
                <button type="button" className={btnSecondary}
                  onClick={() => { setShowForm(false); setOrchForm({ ...EMPTY_ORCHESTRATOR_FORM }); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Operators section */}
      {operators.length > 0 && (
        <>
          <h3 className="text-md font-semibold text-text-primary mb-3">Operators</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 mb-6">
            {operators.map((s) => (
              <Link to={`/workbench/agents/${s.id}`} key={s.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 block no-underline hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-text-primary text-sm">{s.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] || "bg-gray-200 text-gray-700"}`}>
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{s.description || "No description"}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span>{s.api_type}</span>
                  <span>{s.use_case_count || 0} use case{(s.use_case_count || 0) !== 1 ? "s" : ""}</span>
                  {s.has_api_spec && <span>API spec loaded</span>}
                  {s.has_api_key && <span>API key set</span>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Orchestrators section */}
      {orchestrators.length > 0 && (
        <>
          <h3 className="text-md font-semibold text-text-primary mb-3">Orchestrators</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 mb-6">
            {orchestrators.map((s) => (
              <Link to={`/workbench/agents/${s.id}`} key={s.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 block no-underline hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-text-primary text-sm">{s.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] || "bg-gray-200 text-gray-700"}`}>
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{s.description || "No description"}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span>{s.use_case_count || 0} use case{(s.use_case_count || 0) !== 1 ? "s" : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">No agents yet. Start by seeding demo data or add agents manually.</p>
          <button className={btnPrimary} onClick={() => seedDemo.mutate()} disabled={seedDemo.isPending}>
            {seedDemo.isPending ? "Loading..." : "Load Demo Data (DummyJSON APIs)"}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Creates 3 agents with 12 prefilled use cases using real public APIs you can test immediately.
          </p>
        </div>
      )}
    </div>
  );
}
