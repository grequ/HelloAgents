import { useState } from "react";
import { Link } from "react-router-dom";
import type { SystemCreate } from "../types";
import { useDashboard, useCreateSystem, useSeedDemoData } from "./queries";

const STATUS_COLORS: Record<string, string> = {
  inventoried: "bg-gray-200 text-gray-700",
  api_documented: "bg-blue-100 text-blue-700",
  use_cases_defined: "bg-green-100 text-green-700",
  tested: "bg-amber-100 text-amber-700",
  spec_generated: "bg-emerald-100 text-emerald-700",
};

const EMPTY_FORM: SystemCreate = {
  name: "", description: "", category: "", owner_team: "", api_type: "rest", api_base_url: "",
};

export default function Dashboard() {
  const { data, isLoading } = useDashboard();
  const createSystem = useCreateSystem();
  const seedDemo = useSeedDemoData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SystemCreate>({ ...EMPTY_FORM });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSystem.mutateAsync(form);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  };

  if (isLoading) return <p className="p-6 text-sm text-gray-500">Loading...</p>;

  const systems = data?.systems || [];
  const stats = data?.stats || { systems: {}, use_cases: {}, specs_total: 0 };
  const sysTotal = Object.values(stats.systems).reduce((a, b) => a + b, 0);
  const ucTotal = Object.values(stats.use_cases).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Systems", value: sysTotal },
          { label: "Use Cases", value: ucTotal },
          { label: "Agent Specs", value: stats.specs_total },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
            <div className="text-3xl font-bold text-text-primary">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Systems section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Systems</h2>
        <button
          className="px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan transition-colors"
          onClick={() => setShowForm(!showForm)}
        >
          + Add System
        </button>
      </div>

      {showForm && (
        <form className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4 space-y-3" onSubmit={handleCreate}>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan"
              placeholder="System name *" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan"
              placeholder="Category (e.g. logistics, finance)" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan"
            placeholder="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan"
              placeholder="Owner team" value={form.owner_team}
              onChange={(e) => setForm({ ...form, owner_team: e.target.value })}
            />
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan"
              value={form.api_type} onChange={(e) => setForm({ ...form, api_type: e.target.value })}
            >
              <option value="rest">REST API</option>
              <option value="graphql">GraphQL</option>
              <option value="soap">SOAP</option>
              <option value="grpc">gRPC</option>
              <option value="database">Database</option>
              <option value="none">No API</option>
            </select>
          </div>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan"
            placeholder="API Base URL (e.g. https://api.example.com/v1)" value={form.api_base_url}
            onChange={(e) => setForm({ ...form, api_base_url: e.target.value })}
          />
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan" disabled={createSystem.isPending}>
              {createSystem.isPending ? "Creating..." : "Create"}
            </button>
            <button type="button" className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-100" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {systems.map((s) => (
          <Link
            to={`/workbench/systems/${s.id}`}
            key={s.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 block no-underline hover:shadow-md transition-shadow"
          >
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

      {systems.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">No systems yet. Start by seeding demo data or add systems manually.</p>
          <button
            className="px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan disabled:opacity-50"
            onClick={() => seedDemo.mutate()}
            disabled={seedDemo.isPending}
          >
            {seedDemo.isPending ? "Loading..." : "Load Demo Data (DummyJSON APIs)"}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Creates 3 systems with 12 prefilled use cases using real public APIs you can test immediately.
          </p>
        </div>
      )}
    </div>
  );
}
