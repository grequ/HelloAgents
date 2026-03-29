import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSpec, useUpdateSpec, useDeleteSpec } from "./queries";
import { btnPrimary, btnSecondary, btnDanger } from "./ui";

const TABS = [
  { key: "spec", label: "Specification" },
  { key: "tools", label: "Tools JSON" },
  { key: "prompt", label: "System Prompt" },
  { key: "code", label: "Python Code" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AgentSpecView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: spec } = useSpec(id!);
  const updateSpec = useUpdateSpec();
  const deleteSpecMut = useDeleteSpec();

  const [tab, setTab] = useState<TabKey>("spec");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [specMd, setSpecMd] = useState("");
  const [toolsJson, setToolsJson] = useState("");
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(specMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = specMd;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [specMd]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (spec) {
      setSpecMd(spec.spec_markdown || "");
      setToolsJson(JSON.stringify(spec.tools_json, null, 2) || "");
      setPrompt(spec.system_prompt || "");
      setCode(spec.skeleton_code || "");
      setDirty(false);
    }
  }, [spec]);

  const handleSave = async () => {
    if (!id) return;
    let parsedTools: unknown;
    try {
      parsedTools = JSON.parse(toolsJson);
    } catch {
      alert("Invalid Tools JSON");
      return;
    }
    await updateSpec.mutateAsync({
      id,
      data: {
        spec_markdown: specMd,
        tools_json: parsedTools,
        system_prompt: prompt,
        skeleton_code: code,
      },
    });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCancel = () => {
    if (!confirm("Discard unsaved changes?")) return;
    if (spec) {
      setSpecMd(spec.spec_markdown || "");
      setToolsJson(JSON.stringify(spec.tools_json, null, 2) || "");
      setPrompt(spec.system_prompt || "");
      setCode(spec.skeleton_code || "");
    }
    setDirty(false);
  };

  const handleDelete = async () => {
    if (!id || !confirm("Delete this agent spec permanently?")) return;
    await deleteSpecMut.mutateAsync(id);
    nav("/workbench/specs");
  };

  if (!spec) return <p className="text-sm text-gray-500">Loading...</p>;

  const editors: Record<TabKey, { value: string; set: (v: string) => void; mono: boolean }> = {
    spec: { value: specMd, set: setSpecMd, mono: false },
    tools: { value: toolsJson, set: setToolsJson, mono: true },
    prompt: { value: prompt, set: setPrompt, mono: false },
    code: { value: code, set: setCode, mono: true },
  };
  const cur = editors[tab];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{spec.name}</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
            {spec.status}
          </span>
        </div>
        <div className="flex gap-2">
          <button className={btnPrimary} onClick={handleSave} disabled={!dirty || updateSpec.isPending}>
            {saved ? "Saved!" : dirty ? "\u25CF Save" : "Save"}
          </button>
          {dirty && <button className={btnSecondary} onClick={handleCancel}>Cancel</button>}
          <button className={btnSecondary} onClick={handleCopyMarkdown}>
            {copied ? "Copied!" : "Copy .md"}
          </button>
          <button className={btnDanger} onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? "bg-white text-tedee-navy border border-b-0 border-gray-200"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-gray-200 p-1">
        <textarea
          className={`w-full min-h-[500px] p-4 text-sm outline-none resize-y rounded-lg ${
            cur.mono ? "font-mono text-xs" : ""
          }`}
          value={cur.value}
          onChange={(e) => {
            cur.set(e.target.value);
            setDirty(true);
          }}
        />
      </div>

      {/* Dependencies */}
      {((spec.depends_on?.length ?? 0) > 0 || (spec.called_by?.length ?? 0) > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-5">
          <h3 className="font-semibold text-text-primary text-sm mb-2">Cross-Agent Dependencies</h3>
          {(spec.called_by?.length ?? 0) > 0 && (
            <p className="text-sm text-gray-600"><strong>Called by:</strong> {spec.called_by!.join(", ")}</p>
          )}
          {(spec.depends_on?.length ?? 0) > 0 && (
            <p className="text-sm text-gray-600"><strong>Depends on:</strong> {spec.depends_on!.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
