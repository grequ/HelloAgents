import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getSystem, getUseCase, updateUseCase, deleteUseCase, discover, runTest, saveDiscovery } from "./api";

function guessTestInput(userInput) {
  if (!userInput) return '{\n  \n}';
  const lower = userInput.toLowerCase();
  // Try to extract parameter hints from the user_input description
  const obj = {};
  if (lower.includes("product id"))        obj.id = 5;
  else if (lower.includes("cart") || lower.includes("order id")) obj.id = 1;
  else if (lower.includes("customer id") || lower.includes("user id")) obj.id = 1;
  else if (lower.includes("search") || lower.includes("keyword")) obj.q = "laptop";
  else if (lower.includes("category"))     obj.category = "smartphones";
  else if (lower.includes("name"))         obj.q = "Emily";
  else if (lower.includes("id"))           obj.id = 1;

  if (Object.keys(obj).length === 0) obj.q = "test";
  return JSON.stringify(obj, null, 2);
}

export default function Playground() {
  const { id: systemId, ucId } = useParams();
  const nav = useNavigate();
  const [system, setSystem] = useState(null);
  const [uc, setUc] = useState(null);
  const [loading, setLoading] = useState(true);

  // Editable discovery state
  const [endpoints, setEndpoints] = useState([]);
  const [behavior, setBehavior] = useState("");
  const [toolDef, setToolDef] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Discovery
  const [discovering, setDiscovering] = useState(false);

  // Testing
  const [testInputStr, setTestInputStr] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    setLoading(true);
    const [s, u] = await Promise.all([getSystem(systemId), getUseCase(ucId)]);
    setSystem(s);
    setUc(u);
    if (u?.discovered_endpoints) {
      setEndpoints(u.discovered_endpoints);
      setBehavior(u.discovered_behavior || "");
    }
    // Pre-fill test input from user_input field
    if (!testInputStr || testInputStr === '{\n  \n}') {
      setTestInputStr(guessTestInput(u?.user_input));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [systemId, ucId]);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discover(systemId, ucId);
      setEndpoints(result.endpoints || []);
      setBehavior(result.behavior || "");
      setToolDef(result.tool_definition ? JSON.stringify(result.tool_definition, null, 2) : "");
      setDirty(true);
      const u = await getUseCase(ucId);
      setUc(u);
    } catch (e) {
      alert("Discovery failed: " + e.message);
    }
    setDiscovering(false);
  };

  const handleSaveDiscovery = async () => {
    setSaving(true);
    try {
      await saveDiscovery(ucId, { endpoints, behavior });
      setDirty(false);
      const u = await getUseCase(ucId);
      setUc(u);
    } catch (e) {
      alert("Save failed: " + e.message);
    }
    setSaving(false);
  };

  const handleDeleteUc = async () => {
    if (!confirm("Delete this use case?")) return;
    await deleteUseCase(ucId);
    nav(`/workbench/systems/${systemId}`);
  };

  // Endpoint editing
  const updateEndpoint = (idx, field, value) => {
    const updated = [...endpoints];
    updated[idx] = { ...updated[idx], [field]: value };
    setEndpoints(updated);
    setDirty(true);
  };

  const removeEndpoint = (idx) => {
    setEndpoints(endpoints.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const addEndpoint = () => {
    setEndpoints([...endpoints, { method: "GET", path: "/", purpose: "", parameters: {}, extracts: [] }]);
    setDirty(true);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const input = JSON.parse(testInputStr);
      const result = await runTest(systemId, ucId, input);
      setTestResult(result);
      const u = await getUseCase(ucId);
      setUc(u);
    } catch (e) {
      alert("Test failed: " + e.message);
    }
    setTesting(false);
  };

  if (loading) return <div className="wb-page"><p>Loading...</p></div>;
  if (!system || !uc) return <div className="wb-page"><p>Not found</p></div>;

  return (
    <div className="wb-page">
      <div className="wb-header">
        <div>
          <Link to={`/workbench/systems/${systemId}`} className="wb-back">&larr; {system.name}</Link>
          <h1>{uc.name}</h1>
          <span className={`wb-badge status-${uc.status}`}>{uc.status}</span>
        </div>
        <div className="wb-header-actions">
          <button className="wb-btn-danger" onClick={handleDeleteUc}>Delete Use Case</button>
        </div>
      </div>

      <div className="wb-playground-layout">
        {/* Left — Use Case Definition */}
        <div className="wb-playground-left">
          <div className="wb-card">
            <h3>Use Case Definition</h3>
            <div className="wb-field">
              <label>Trigger</label>
              <p>{uc.trigger_text || "—"}</p>
            </div>
            <div className="wb-field">
              <label>User Provides</label>
              <p>{uc.user_input || "—"}</p>
            </div>
            <div className="wb-field">
              <label>Expected Output</label>
              <p>{uc.expected_output || "—"}</p>
            </div>
            <div className="wb-field-row">
              <div className="wb-field">
                <label>Frequency</label>
                <p>{uc.frequency || "—"}</p>
              </div>
              <div className="wb-field">
                <label>Priority</label>
                <p className={`wb-tag ${uc.priority}`}>{uc.priority}</p>
              </div>
              <div className="wb-field">
                <label>Type</label>
                <p>{uc.is_write ? "Read + Write" : "Read only"}</p>
              </div>
            </div>
          </div>

          {/* Test History */}
          {uc.test_results && uc.test_results.length > 0 && (
            <div className="wb-card">
              <h3>Test History ({uc.test_results.length})</h3>
              {uc.test_results.slice(-5).reverse().map((tr, i) => (
                <div key={i} className="wb-test-history-item">
                  <span className="wb-test-time">{tr.timestamp ? new Date(tr.timestamp).toLocaleString() : "—"}</span>
                  <span>{tr.steps?.every(s => s.success) ? "Pass" : "Fail"}</span>
                  <span>{tr.total_latency_ms}ms</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Playground */}
        <div className="wb-playground-right">

          {/* Discovery */}
          <div className="wb-card">
            <div className="wb-section-header">
              <h3>Self-Discovery</h3>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="wb-btn-save" onClick={handleSaveDiscovery} disabled={!dirty || saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                {!system.has_api_spec ? (
                  <span className="wb-warning">Upload API spec first</span>
                ) : (
                  <button className="wb-btn" onClick={handleDiscover} disabled={discovering}>
                    {discovering ? "Analyzing..." : endpoints.length ? "Re-run Discovery" : "Run Discovery"}
                  </button>
                )}
              </div>
            </div>

            {endpoints.length > 0 && (
              <div className="wb-discovery-result">
                <div className="wb-endpoints">
                  <div className="wb-section-header" style={{ marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>Mapped Endpoints</h4>
                    <button className="wb-btn-sm" onClick={addEndpoint}>+ Add Endpoint</button>
                  </div>
                  {endpoints.map((ep, i) => (
                    <div key={i} className="wb-endpoint-edit">
                      <div className="wb-endpoint-edit-row">
                        <select value={ep.method || "GET"} onChange={e => updateEndpoint(i, "method", e.target.value)}>
                          <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
                        </select>
                        <input value={ep.path || ""} placeholder="/path/{param}"
                          onChange={e => updateEndpoint(i, "path", e.target.value)} />
                        <button className="wb-btn-danger-sm wb-btn-sm" onClick={() => removeEndpoint(i)} title="Remove">X</button>
                      </div>
                      <input value={ep.purpose || ""} placeholder="Purpose — why is this call needed?"
                        className="wb-endpoint-purpose-input"
                        onChange={e => updateEndpoint(i, "purpose", e.target.value)} />
                    </div>
                  ))}
                </div>

                <div className="wb-behavior">
                  <h4>Agent Behavior</h4>
                  <textarea rows={3} value={behavior}
                    onChange={e => { setBehavior(e.target.value); setDirty(true); }}
                    placeholder="Describe how the agent chains these calls..." />
                </div>

                {toolDef && (
                  <div className="wb-tool-preview">
                    <h4>Generated Tool Definition</h4>
                    <textarea className="wb-code-input" rows={8} value={toolDef}
                      onChange={e => setToolDef(e.target.value)} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Test */}
          <div className="wb-card">
            <h3>Live Test</h3>
            {!uc.discovered_endpoints && endpoints.length === 0 ? (
              <p className="wb-hint">Run discovery first to map endpoints, then you can test.</p>
            ) : (
              <>
                <div className="wb-field">
                  <label>Test Input (JSON) — based on "{uc.user_input}"</label>
                  <textarea className="wb-code-input" rows={4} value={testInputStr}
                    onChange={e => setTestInputStr(e.target.value)} />
                </div>
                <button className="wb-btn" onClick={handleTest} disabled={testing}>
                  {testing ? "Running test..." : "Run Test"}
                </button>

                {testResult && (
                  <div className="wb-test-result">
                    <h4>Test Steps</h4>
                    {testResult.steps?.map((step, i) => (
                      <div key={i} className={`wb-test-step ${step.success ? "success" : "fail"}`}>
                        <div className="wb-test-step-header">
                          <code>{step.endpoint}</code>
                          <span className={`wb-status-code ${step.success ? "ok" : "err"}`}>
                            {step.status_code} ({step.latency_ms}ms)
                          </span>
                        </div>
                        <pre className="wb-test-response">{JSON.stringify(step.response, null, 2)}</pre>
                      </div>
                    ))}

                    {testResult.agent_response && (
                      <div className="wb-agent-response">
                        <h4>Agent Would Answer</h4>
                        <div className="wb-agent-answer">{testResult.agent_response}</div>
                      </div>
                    )}

                    <div className="wb-test-summary">
                      Total latency: {testResult.total_latency_ms}ms
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
