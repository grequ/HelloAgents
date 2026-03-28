import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getSpec, updateSpec, deleteSpec, listSpecs } from "./api";

function SpecDetail() {
  const { specId } = useParams();
  const nav = useNavigate();
  const [spec, setSpec] = useState(null);
  const [tab, setTab] = useState("spec");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [specMd, setSpecMd] = useState("");
  const [toolsJson, setToolsJson] = useState("");
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    getSpec(specId).then(s => {
      setSpec(s);
      setSpecMd(s.spec_markdown || "");
      setToolsJson(JSON.stringify(s.tools_json, null, 2) || "");
      setPrompt(s.system_prompt || "");
      setCode(s.skeleton_code || "");
    });
  }, [specId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let parsedTools;
      try { parsedTools = JSON.parse(toolsJson); } catch { alert("Invalid Tools JSON"); setSaving(false); return; }
      const updated = await updateSpec(specId, {
        spec_markdown: specMd,
        tools_json: parsedTools,
        system_prompt: prompt,
        skeleton_code: code,
      });
      setSpec(updated);
      setDirty(false);
    } catch (e) {
      alert("Save failed: " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this agent spec permanently?")) return;
    await deleteSpec(specId);
    nav("/workbench/specs");
  };

  if (!spec) return <div className="wb-page"><p>Loading...</p></div>;

  const tabs = [
    { key: "spec", label: "Specification" },
    { key: "tools", label: "Tools JSON" },
    { key: "prompt", label: "System Prompt" },
    { key: "code", label: "Python Code" },
  ];

  return (
    <div className="wb-page">
      <div className="wb-header">
        <div>
          <Link to="/workbench/specs" className="wb-back">&larr; All Specs</Link>
          <h1>{spec.name}</h1>
          <span className="wb-badge">{spec.status}</span>
        </div>
        <div className="wb-header-actions">
          <button className="wb-btn-save" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <a href={`/workbench/specs/${specId}/download`} className="wb-btn-download" download>
            Download .md
          </a>
          <button className="wb-btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="wb-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`wb-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="wb-card wb-spec-content">
        {tab === "spec" && (
          <textarea className="wb-spec-editor" value={specMd}
            onChange={e => { setSpecMd(e.target.value); setDirty(true); }} />
        )}
        {tab === "tools" && (
          <textarea className="wb-spec-editor wb-code-font" value={toolsJson}
            onChange={e => { setToolsJson(e.target.value); setDirty(true); }} />
        )}
        {tab === "prompt" && (
          <textarea className="wb-spec-editor" value={prompt}
            onChange={e => { setPrompt(e.target.value); setDirty(true); }} />
        )}
        {tab === "code" && (
          <textarea className="wb-spec-editor wb-code-font" value={code}
            onChange={e => { setCode(e.target.value); setDirty(true); }} />
        )}
      </div>

      {(spec.depends_on?.length > 0 || spec.called_by?.length > 0) && (
        <div className="wb-card">
          <h3>Cross-Agent Dependencies</h3>
          {spec.called_by?.length > 0 && <p><strong>Called by:</strong> {spec.called_by.join(", ")}</p>}
          {spec.depends_on?.length > 0 && <p><strong>Depends on:</strong> {spec.depends_on.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

function SpecList() {
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSpecs().then(s => { setSpecs(s); setLoading(false); });
  }, []);

  if (loading) return <div className="wb-page"><p>Loading...</p></div>;

  return (
    <div className="wb-page">
      <div className="wb-header">
        <div>
          <Link to="/workbench" className="wb-back">&larr; Dashboard</Link>
          <h1>Generated Agent Specs</h1>
        </div>
      </div>

      <div className="wb-uc-list">
        {specs.map(s => (
          <Link to={`/workbench/specs/${s.id}`} key={s.id} className="wb-system-card">
            <div className="wb-system-card-header">
              <span className="wb-system-name">{s.name}</span>
              <span className="wb-badge">{s.status}</span>
            </div>
            <div className="wb-system-meta">
              <span>{(s.system_ids || []).length} systems</span>
              <span>{(s.use_case_ids || []).length} use cases</span>
              <span>{s.generated_at ? new Date(s.generated_at).toLocaleDateString() : ""}</span>
            </div>
          </Link>
        ))}
        {specs.length === 0 && (
          <p className="wb-empty">No specs generated yet. Go to a system and click "Generate Agent Spec".</p>
        )}
      </div>
    </div>
  );
}

export { SpecDetail, SpecList };
