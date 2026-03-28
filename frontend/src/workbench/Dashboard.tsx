import { useState } from "react";
import { Link } from "react-router-dom";
import type { ConnectionResult } from "../types";
import { useDashboard, useCreateAgent, useSeedDemoData, useSetApiKey } from "./queries";
import { testUrl } from "./api";
import { btnPrimary, btnSecondary, btnGhost, inp } from "./ui";

const STATUS_COLORS: Record<string, string> = {
  inventoried: "bg-gray-200 text-gray-700",
  api_documented: "bg-blue-100 text-blue-700",
  use_cases_defined: "bg-green-100 text-green-700",
  tested: "bg-amber-100 text-amber-700",
  spec_generated: "bg-emerald-100 text-emerald-700",
};

const EMPTY_FORM = {
  name: "", description: "", category: "", owner_team: "",
  api_type: "rest", api_base_url: "", api_key: "",
};

export default function Dashboard() {
  const { data, isLoading } = useDashboard();
  const createAgent = useCreateAgent();
  const setApiKey = useSetApiKey();
  const seedDemo = useSeedDemoData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [connResult, setConnResult] = useState<ConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);

  const isMcp = form.api_type === "mcp";
  const isNone = form.api_type === "none";
  const needsTest = !isMcp && !isNone;
  const connectionOk = connResult?.ok === true;
  const canCreate = form.name.trim().length > 0 && (isNone || isMcp || connectionOk);

  const handleTestConnection = async () => {
    if (!form.api_base_url.trim()) return;
    setTesting(true);
    setConnResult(null);
    try {
      const result = await testUrl(form.api_base_url, form.api_key, "bearer");
      setConnResult(result);
    } catch (e: unknown) {
      setConnResult({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setTesting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const agent = await createAgent.mutateAsync({
        name: form.name,
        description: form.description,
        category: form.category,
        owner_team: form.owner_team,
        api_type: form.api_type,
        api_base_url: form.api_base_url,
      });
      if (form.api_key.trim()) {
        await setApiKey.mutateAsync({ id: agent.id, apiKey: form.api_key });
      }
      setForm({ ...EMPTY_FORM });
      setConnResult(null);
      setShowForm(false);
    } catch (e: unknown) {
      alert("Create failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  if (isLoading) return <p className="p-6 text-sm text-gray-500">Loading...</p>;

  const agents = data?.agents || [];
  const stats = data?.stats || { agents: {}, use_cases: {}, specs_total: 0 };
  const agentTotal = Object.values(stats.agents).reduce((a, b) => a + b, 0);
  const ucTotal = Object.values(stats.use_cases).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Agents", value: agentTotal },
          { label: "Use Cases", value: ucTotal },
          { label: "Specs", value: stats.specs_total },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
            <div className="text-3xl font-bold text-text-primary">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Agents section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Agents</h2>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}>+ Add Agent</button>
      </div>

      {showForm && (
        <form className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4 space-y-3" onSubmit={handleCreate}>
          <div className="grid grid-cols-2 gap-3">
            <input className={inp} placeholder="Agent name *" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inp} placeholder="Category (e.g. logistics, finance)" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <input className={inp} placeholder="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className={inp} placeholder="Owner team" value={form.owner_team}
              onChange={(e) => setForm({ ...form, owner_team: e.target.value })} />
            <select className={inp} value={form.api_type}
              onChange={(e) => { setForm({ ...form, api_type: e.target.value }); setConnResult(null); }}>
              <option value="rest">REST API</option>
              <option value="graphql">GraphQL</option>
              <option value="mcp">MCP Server</option>
              <option value="soap">SOAP</option>
              <option value="grpc">gRPC</option>
              <option value="database">Database</option>
              <option value="none">No API</option>
            </select>
          </div>

          {!isNone && (
            <>
              <input className={inp}
                placeholder={isMcp ? "Server URI (e.g. stdio://./server or http://localhost:3001/sse)" : "API Base URL (e.g. https://api.example.com/v1)"}
                value={form.api_base_url}
                onChange={(e) => { setForm({ ...form, api_base_url: e.target.value }); setConnResult(null); }} />
              <input className={inp} type="password"
                placeholder={isMcp ? "Auth token (optional)" : "API Key (optional)"}
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            </>
          )}

          {needsTest && (
            <div className="flex items-center gap-3">
              <button type="button" className={btnGhost}
                onClick={handleTestConnection}
                disabled={testing || !form.api_base_url.trim()}>
                {testing ? "Testing..." : "Test Connection"}
              </button>
              {connResult && (
                <span className={`text-xs font-medium ${connResult.ok ? "text-green-600" : "text-red-600"}`}>
                  {connResult.ok ? `Connected (${connResult.status_code})` : `Failed: ${connResult.error}`}
                </span>
              )}
              {!connResult && !testing && form.api_base_url.trim() && (
                <span className="text-xs text-amber-600">Test connection before creating</span>
              )}
            </div>
          )}

          <div className="flex gap-2 items-center">
            <button type="submit" className={btnPrimary} disabled={createAgent.isPending || !canCreate}>
              {createAgent.isPending ? "Creating..." : "Create"}
            </button>
            <button type="button" className={btnSecondary}
              onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); setConnResult(null); }}>
              Cancel
            </button>
            {needsTest && !connectionOk && form.api_base_url.trim() && (
              <span className="text-xs text-gray-400">Test connection to enable Create</span>
            )}
          </div>
        </form>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {agents.map((s) => (
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
              <span>{s.use_case_count || 0} use cases</span>
              {s.has_api_spec && <span>API spec loaded</span>}
              {s.has_api_key && <span>API key set</span>}
            </div>
          </Link>
        ))}
      </div>

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
