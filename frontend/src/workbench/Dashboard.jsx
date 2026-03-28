import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getDashboard, createSystem } from "./api";

async function seedDemoData() {
  const res = await fetch("/workbench/seed", { method: "POST" });
  return res.json();
}

const STATUS_COLORS = {
  inventoried: "#e0e0e0",
  api_documented: "#bbdefb",
  use_cases_defined: "#c8e6c9",
  tested: "#fff9c4",
  spec_generated: "#c8e6c9",
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", owner_team: "", api_type: "rest", api_base_url: "" });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getDashboard();
      setData(d);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await createSystem(form);
    setForm({ name: "", description: "", category: "", owner_team: "", api_type: "rest", api_base_url: "" });
    setShowForm(false);
    load();
  };

  if (loading) return <div className="wb-page"><p>Loading...</p></div>;

  const systems = data?.systems || [];
  const stats = data?.stats || {};
  const sysTotal = Object.values(stats.systems || {}).reduce((a, b) => a + b, 0);
  const ucTotal = Object.values(stats.use_cases || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="wb-page">
      <div className="wb-header">
        <h1>Agent Migration Workbench</h1>
        <Link to="/" className="wb-btn-secondary">Back to Demo</Link>
      </div>

      <div className="wb-stats-row">
        <div className="wb-stat-card">
          <div className="wb-stat-number">{sysTotal}</div>
          <div className="wb-stat-label">Systems</div>
        </div>
        <div className="wb-stat-card">
          <div className="wb-stat-number">{ucTotal}</div>
          <div className="wb-stat-label">Use Cases</div>
        </div>
        <div className="wb-stat-card">
          <div className="wb-stat-number">{stats.specs_total || 0}</div>
          <div className="wb-stat-label">Agent Specs</div>
        </div>
      </div>

      <div className="wb-section">
        <div className="wb-section-header">
          <h2>Systems</h2>
          <button className="wb-btn" onClick={() => setShowForm(!showForm)}>+ Add System</button>
        </div>

        {showForm && (
          <form className="wb-form" onSubmit={handleCreate}>
            <div className="wb-form-row">
              <input placeholder="System name *" required value={form.name}
                onChange={e => setForm({...form, name: e.target.value})} />
              <input placeholder="Category (e.g. logistics, finance)"  value={form.category}
                onChange={e => setForm({...form, category: e.target.value})} />
            </div>
            <input placeholder="Description" value={form.description}
              onChange={e => setForm({...form, description: e.target.value})} />
            <div className="wb-form-row">
              <input placeholder="Owner team" value={form.owner_team}
                onChange={e => setForm({...form, owner_team: e.target.value})} />
              <select value={form.api_type} onChange={e => setForm({...form, api_type: e.target.value})}>
                <option value="rest">REST API</option>
                <option value="graphql">GraphQL</option>
                <option value="soap">SOAP</option>
                <option value="grpc">gRPC</option>
                <option value="database">Database</option>
                <option value="none">No API</option>
              </select>
            </div>
            <input placeholder="API Base URL (e.g. https://api.example.com/v1)" value={form.api_base_url}
              onChange={e => setForm({...form, api_base_url: e.target.value})} />
            <div className="wb-form-actions">
              <button type="submit" className="wb-btn">Create</button>
              <button type="button" className="wb-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="wb-system-grid">
          {systems.map(s => (
            <Link to={`/workbench/systems/${s.id}`} key={s.id} className="wb-system-card">
              <div className="wb-system-card-header">
                <span className="wb-system-name">{s.name}</span>
                <span className="wb-badge" style={{ background: STATUS_COLORS[s.status] || "#e0e0e0" }}>
                  {s.status}
                </span>
              </div>
              <p className="wb-system-desc">{s.description || "No description"}</p>
              <div className="wb-system-meta">
                <span>{s.api_type}</span>
                <span>{s.use_case_count || 0} use cases</span>
                {s.has_api_spec && <span>API spec loaded</span>}
                {s.has_api_key && <span>API key set</span>}
              </div>
            </Link>
          ))}
          {systems.length === 0 && (
            <div className="wb-empty-state">
              <p>No systems yet. Start by seeding demo data or add systems manually.</p>
              <button className="wb-btn" onClick={async () => { await seedDemoData(); load(); }}>
                Load Demo Data (DummyJSON APIs)
              </button>
              <p className="wb-hint" style={{marginTop: 8}}>
                Creates 3 systems with 12 prefilled use cases using real public APIs you can test immediately.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
