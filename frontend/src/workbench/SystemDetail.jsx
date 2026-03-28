import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getSystem, updateSystem, deleteSystem, setSystemApiKey,
  uploadSystemSpecJson, testSystemConnection,
  listSystems, listUseCases, createUseCase, deleteUseCase,
  generateSpec,
} from "./api";

export default function SystemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [system, setSystem] = useState(null);
  const [useCases, setUseCases] = useState([]);
  const [allSystems, setAllSystems] = useState([]);
  const [allUseCasesBySystem, setAllUseCasesBySystem] = useState({});
  const [loading, setLoading] = useState(true);

  // Forms
  const [showUcForm, setShowUcForm] = useState(false);
  const [ucForm, setUcForm] = useState({ name: "", description: "", trigger_text: "", user_input: "", expected_output: "", frequency: "", is_write: false, priority: "medium" });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [specInput, setSpecInput] = useState("");
  const [connResult, setConnResult] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [showGenForm, setShowGenForm] = useState(false);
  const [genConfig, setGenConfig] = useState({
    agent_name: "",
    tech_stack: "Python 3.11",
    framework: "FastAPI + anthropic SDK",
    agent_role: "",
    deployment: "Standalone microservice (Docker)",
    error_handling: "Retry once on 5xx, return graceful error message to user on failure",
    auth_notes: "",
    additional_context: "",
  });
  // Agent interactions — linked systems and their use cases
  const [linkedAgents, setLinkedAgents] = useState([]);
  // { systemId, systemName, direction: "calls"|"called_by", useCaseIds: [] }

  const load = async () => {
    setLoading(true);
    const [s, ucs, allSys] = await Promise.all([getSystem(id), listUseCases(id), listSystems()]);
    setSystem(s);
    setUseCases(ucs);
    setAllSystems(allSys.filter(sys => sys.id !== id));
    // Load use cases for other systems (for interaction linking)
    const ucMap = {};
    for (const sys of allSys.filter(sys => sys.id !== id)) {
      try {
        ucMap[sys.id] = await listUseCases(sys.id);
      } catch { ucMap[sys.id] = []; }
    }
    setAllUseCasesBySystem(ucMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleSetKey = async () => {
    if (!apiKeyInput) return;
    await setSystemApiKey(id, apiKeyInput);
    setApiKeyInput("");
    load();
  };

  const handleUploadSpec = async () => {
    try {
      const spec = JSON.parse(specInput);
      await uploadSystemSpecJson(id, spec);
      setSpecInput("");
      load();
    } catch { alert("Invalid JSON"); }
  };

  const handleTestConn = async () => {
    setConnResult(null);
    const r = await testSystemConnection(id);
    setConnResult(r);
  };

  const handleCreateUc = async (e) => {
    e.preventDefault();
    await createUseCase(id, ucForm);
    setUcForm({ name: "", description: "", trigger_text: "", user_input: "", expected_output: "", frequency: "", is_write: false, priority: "medium" });
    setShowUcForm(false);
    load();
  };

  const handleDeleteUc = async (ucId) => {
    if (!confirm("Delete this use case?")) return;
    await deleteUseCase(ucId);
    load();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this system and all its use cases?")) return;
    await deleteSystem(id);
    nav("/workbench");
  };

  const handleGenerate = async () => {
    setGenLoading(true);
    try {
      // Build interactions text from linked agents
      const interactionLines = linkedAgents.map(la => {
        const dir = la.direction === "calls" ? "This agent calls" : "This agent is called by";
        const ucNames = la.useCaseIds
          .map(ucId => (allUseCasesBySystem[la.systemId] || []).find(u => u.id === ucId)?.name)
          .filter(Boolean);
        return `${dir}: ${la.systemName} Agent` + (ucNames.length ? ` (use cases: ${ucNames.join(", ")})` : "");
      });

      const spec = await generateSpec(
        genConfig.agent_name || system.name + " Agent",
        [id],
        useCases.map(u => u.id),
        {
          tech_stack: genConfig.tech_stack,
          framework: genConfig.framework,
          agent_role: genConfig.agent_role,
          deployment: genConfig.deployment,
          interactions: interactionLines.join("\n") || "",
          error_handling: genConfig.error_handling,
          auth_notes: genConfig.auth_notes,
          additional_context: genConfig.additional_context,
        }
      );
      nav(`/workbench/specs/${spec.id}`);
    } catch (e) {
      alert("Generation failed: " + e.message);
    }
    setGenLoading(false);
  };

  const addLinkedAgent = () => {
    if (allSystems.length === 0) return;
    setLinkedAgents([...linkedAgents, {
      systemId: allSystems[0].id,
      systemName: allSystems[0].name,
      direction: "calls",
      useCaseIds: [],
    }]);
  };

  const updateLinkedAgent = (idx, field, value) => {
    const updated = [...linkedAgents];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "systemId") {
      updated[idx].systemName = allSystems.find(s => s.id === value)?.name || "";
      updated[idx].useCaseIds = [];
    }
    setLinkedAgents(updated);
  };

  const toggleLinkedUseCase = (agentIdx, ucId) => {
    const updated = [...linkedAgents];
    const ucs = updated[agentIdx].useCaseIds;
    updated[agentIdx].useCaseIds = ucs.includes(ucId) ? ucs.filter(id => id !== ucId) : [...ucs, ucId];
    setLinkedAgents(updated);
  };

  const removeLinkedAgent = (idx) => {
    setLinkedAgents(linkedAgents.filter((_, i) => i !== idx));
  };

  function generateRoleFromUseCases(sys, ucs) {
    const domain = sys.category || "general";
    const readUcs = ucs.filter(u => !u.is_write);
    const writeUcs = ucs.filter(u => u.is_write);
    const highPri = ucs.filter(u => u.priority === "high");

    let role = `You are the ${sys.name} Agent, a specialized AI assistant responsible for the ${domain} domain. `;
    role += `You have access to the ${sys.name} system via its ${sys.api_type?.toUpperCase() || "REST"} API. `;

    if (readUcs.length > 0) {
      role += `\n\nYour primary read operations include: ${readUcs.map(u => u.name.toLowerCase()).join(", ")}. `;
    }
    if (writeUcs.length > 0) {
      role += `Your write operations include: ${writeUcs.map(u => u.name.toLowerCase()).join(", ")}. Write operations require explicit user confirmation before execution. `;
    }

    role += `\n\nBehavior guidelines:\n`;
    role += `- Always use ONLY data from tool results. Never fabricate information.\n`;
    role += `- Be concise and factual. Lead with the answer, then provide supporting details.\n`;
    role += `- If a tool call fails, explain what happened and suggest alternatives.\n`;
    role += `- If the request is outside your domain, say so clearly.\n`;

    if (highPri.length > 0) {
      role += `- Prioritize these high-frequency use cases: ${highPri.map(u => u.name).join(", ")}.\n`;
    }

    role += `- For write operations, always confirm the action with the user before proceeding.\n`;
    role += `- Never expose internal system IDs, API keys, or technical details to end users.`;

    return role;
  }

  // Pre-fill agent name and role when system/use cases load
  useEffect(() => {
    if (system && useCases.length > 0) {
      setGenConfig(c => ({
        ...c,
        agent_name: c.agent_name || system.name + " Agent",
        agent_role: c.agent_role || generateRoleFromUseCases(system, useCases),
      }));
    }
  }, [system, useCases]);

  if (loading) return <div className="wb-page"><p>Loading...</p></div>;
  if (!system) return <div className="wb-page"><p>System not found</p></div>;

  return (
    <div className="wb-page">
      <div className="wb-header">
        <div>
          <Link to="/workbench" className="wb-back">&larr; Back</Link>
          <h1>{system.name}</h1>
          <p className="wb-subtitle">{system.description}</p>
        </div>
        <div className="wb-header-actions">
          <span className="wb-badge">{system.status}</span>
          <button className="wb-btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {/* API Configuration */}
      <div className="wb-section wb-card">
        <h2>API Configuration</h2>
        <div className="wb-info-grid">
          <div><strong>Type:</strong> {system.api_type}</div>
          <div><strong>Base URL:</strong> {system.api_base_url || "Not set"}</div>
          <div><strong>Docs:</strong> {system.api_docs_url ? <a href={system.api_docs_url} target="_blank" rel="noreferrer">{system.api_docs_url}</a> : "Not set"}</div>
          <div><strong>Auth:</strong> {system.api_auth_type}</div>
          <div><strong>API Key:</strong> {system.has_api_key ? "Set" : "Not set"}</div>
          <div><strong>API Spec:</strong> {system.has_api_spec ? `Loaded (${system.api_spec_endpoint_count} endpoints)` : "Not uploaded"}</div>
        </div>

        <div className="wb-config-actions">
          <div className="wb-inline-form">
            <input type="password" placeholder="API Key" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} />
            <button className="wb-btn-sm" onClick={handleSetKey}>Set Key</button>
          </div>
          <div className="wb-inline-form">
            <textarea placeholder="Paste OpenAPI/Swagger JSON spec here..." rows={3} value={specInput} onChange={e => setSpecInput(e.target.value)} />
            <button className="wb-btn-sm" onClick={handleUploadSpec}>Upload Spec</button>
          </div>
          <div>
            <button className="wb-btn-sm" onClick={handleTestConn}>Test Connection</button>
            {connResult && (
              <span className={`wb-conn-result ${connResult.ok ? "ok" : "fail"}`}>
                {connResult.ok ? `Connected (${connResult.status_code})` : `Failed: ${connResult.error}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div className="wb-section">
        <div className="wb-section-header">
          <h2>Use Cases ({useCases.length})</h2>
          <button className="wb-btn" onClick={() => setShowUcForm(!showUcForm)}>+ Add Use Case</button>
        </div>

        {showUcForm && (
          <form className="wb-form" onSubmit={handleCreateUc}>
            <input placeholder="Use case name *" required value={ucForm.name}
              onChange={e => setUcForm({...ucForm, name: e.target.value})} />
            <input placeholder="Description" value={ucForm.description}
              onChange={e => setUcForm({...ucForm, description: e.target.value})} />
            <textarea placeholder="Trigger — what question or event triggers this?" rows={2} value={ucForm.trigger_text}
              onChange={e => setUcForm({...ucForm, trigger_text: e.target.value})} />
            <textarea placeholder="User input — what information does the user provide?" rows={2} value={ucForm.user_input}
              onChange={e => setUcForm({...ucForm, user_input: e.target.value})} />
            <textarea placeholder="Expected output — what should the response contain?" rows={2} value={ucForm.expected_output}
              onChange={e => setUcForm({...ucForm, expected_output: e.target.value})} />
            <div className="wb-form-row">
              <input placeholder="Frequency (e.g. ~200/day)" value={ucForm.frequency}
                onChange={e => setUcForm({...ucForm, frequency: e.target.value})} />
              <select value={ucForm.priority} onChange={e => setUcForm({...ucForm, priority: e.target.value})}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <label className="wb-checkbox">
                <input type="checkbox" checked={ucForm.is_write} onChange={e => setUcForm({...ucForm, is_write: e.target.checked})} />
                Write operation
              </label>
            </div>
            <div className="wb-form-actions">
              <button type="submit" className="wb-btn">Create</button>
              <button type="button" className="wb-btn-secondary" onClick={() => setShowUcForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="wb-uc-list">
          {useCases.map(uc => (
            <div key={uc.id} className="wb-uc-card">
              <div className="wb-uc-header">
                <Link to={`/workbench/systems/${id}/usecases/${uc.id}`} className="wb-uc-name">{uc.name}</Link>
                <div className="wb-uc-tags">
                  <span className={`wb-tag ${uc.priority}`}>{uc.priority}</span>
                  {uc.is_write && <span className="wb-tag write">WRITE</span>}
                  <span className={`wb-tag status-${uc.status}`}>{uc.status}</span>
                </div>
              </div>
              <p className="wb-uc-trigger">{uc.trigger_text || uc.description}</p>
              <div className="wb-uc-actions">
                <Link to={`/workbench/systems/${id}/usecases/${uc.id}`} className="wb-btn-sm">Open Playground</Link>
                <button className="wb-btn-sm wb-btn-danger-sm" onClick={() => handleDeleteUc(uc.id)}>Delete</button>
              </div>
            </div>
          ))}
          {useCases.length === 0 && <p className="wb-empty">No use cases yet. Define what humans do with this system today.</p>}
        </div>
      </div>

      {/* Generate Spec */}
      <div className="wb-section wb-card">
        <div className="wb-section-header">
          <h2>Generate Agent Spec</h2>
          {useCases.length > 0 && (
            <button className="wb-btn-secondary" onClick={() => setShowGenForm(!showGenForm)}>
              {showGenForm ? "Hide Config" : "Configure & Generate"}
            </button>
          )}
        </div>

        {useCases.length === 0 ? (
          <p className="wb-empty">Add use cases first before generating a spec.</p>
        ) : !showGenForm ? (
          <p className="wb-hint">{useCases.length} use cases will be included. {useCases.filter(u => u.status === "tested").length} tested. Click "Configure & Generate" to set up the spec.</p>
        ) : (
          <div className="wb-gen-form">
            <p className="wb-hint" style={{marginBottom: 12}}>
              Configure the agent before generating. The output will be a complete .md file you can drop into Claude Code.
            </p>

            <div className="wb-form-row">
              <div className="wb-field" style={{flex: 1}}>
                <label>Agent Name</label>
                <input value={genConfig.agent_name}
                  onChange={e => setGenConfig({...genConfig, agent_name: e.target.value})} />
              </div>
              <div className="wb-field" style={{flex: 1}}>
                <label>Technology Stack</label>
                <select value={genConfig.tech_stack} onChange={e => setGenConfig({...genConfig, tech_stack: e.target.value})}>
                  <option>Python 3.11</option>
                  <option>Python 3.12</option>
                  <option>Node.js / TypeScript</option>
                </select>
              </div>
            </div>

            <div className="wb-form-row">
              <div className="wb-field" style={{flex: 1}}>
                <label>Framework</label>
                <input value={genConfig.framework}
                  onChange={e => setGenConfig({...genConfig, framework: e.target.value})}
                  placeholder="e.g. FastAPI + anthropic SDK" />
              </div>
              <div className="wb-field" style={{flex: 1}}>
                <label>Deployment</label>
                <input value={genConfig.deployment}
                  onChange={e => setGenConfig({...genConfig, deployment: e.target.value})}
                  placeholder="e.g. Docker, AWS Lambda, Kubernetes" />
              </div>
            </div>

            <div className="wb-field">
              <label>Agent Role & Persona</label>
              <textarea rows={2} value={genConfig.agent_role}
                onChange={e => setGenConfig({...genConfig, agent_role: e.target.value})}
                placeholder="How should this agent behave? Tone, boundaries, personality. e.g. 'Friendly customer support agent for TechShop, concise responses, never promises what it can't verify'" />
            </div>

            {/* Agent Interactions — linked agents */}
            <div className="wb-field">
              <label>Interactions with Other Agents</label>
              <p className="wb-hint" style={{margin: "4px 0 8px"}}>
                Link this agent to others in your system. Define who calls whom and which use cases are involved.
              </p>

              {linkedAgents.map((la, idx) => (
                <div key={idx} className="wb-linked-agent">
                  <div className="wb-linked-agent-header">
                    <select value={la.direction} onChange={e => updateLinkedAgent(idx, "direction", e.target.value)}>
                      <option value="calls">This agent CALLS</option>
                      <option value="called_by">This agent is CALLED BY</option>
                    </select>
                    <select value={la.systemId} onChange={e => updateLinkedAgent(idx, "systemId", e.target.value)}>
                      {allSystems.map(s => <option key={s.id} value={s.id}>{s.name} Agent</option>)}
                    </select>
                    <button className="wb-btn-danger-sm wb-btn-sm" onClick={() => removeLinkedAgent(idx)}>X</button>
                  </div>
                  {(allUseCasesBySystem[la.systemId] || []).length > 0 && (
                    <div className="wb-linked-usecases">
                      <span className="wb-hint">Select relevant use cases:</span>
                      {(allUseCasesBySystem[la.systemId] || []).map(uc => (
                        <label key={uc.id} className="wb-checkbox-inline">
                          <input type="checkbox"
                            checked={la.useCaseIds.includes(uc.id)}
                            onChange={() => toggleLinkedUseCase(idx, uc.id)} />
                          {uc.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {allSystems.length > 0 ? (
                <button className="wb-btn-sm" onClick={addLinkedAgent} style={{marginTop: 6}}>
                  + Link Another Agent
                </button>
              ) : (
                <p className="wb-hint">Add more systems to the workbench to link agents together.</p>
              )}
            </div>

            <div className="wb-form-row">
              <div className="wb-field" style={{flex: 1}}>
                <label>Error Handling Strategy</label>
                <input value={genConfig.error_handling}
                  onChange={e => setGenConfig({...genConfig, error_handling: e.target.value})}
                  placeholder="e.g. Retry once on 5xx, graceful fallback" />
              </div>
              <div className="wb-field" style={{flex: 1}}>
                <label>Authentication Notes</label>
                <input value={genConfig.auth_notes}
                  onChange={e => setGenConfig({...genConfig, auth_notes: e.target.value})}
                  placeholder="e.g. API key from env var, OAuth2 client credentials" />
              </div>
            </div>

            <div className="wb-field">
              <label>Additional Context</label>
              <textarea rows={2} value={genConfig.additional_context}
                onChange={e => setGenConfig({...genConfig, additional_context: e.target.value})}
                placeholder="Anything else the implementing agent should know: business rules, compliance requirements, rate limits, data sensitivity..." />
            </div>

            <div style={{display: "flex", gap: 8, alignItems: "center", marginTop: 8}}>
              <button className="wb-btn" onClick={handleGenerate} disabled={genLoading}>
                {genLoading ? "Generating (this takes ~30s)..." : "Generate Agent Spec"}
              </button>
              <span className="wb-hint">{useCases.length} use cases, {useCases.filter(u => u.status === "tested").length} tested</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
