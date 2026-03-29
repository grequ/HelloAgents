import { useState, useEffect, useRef, useCallback } from "react";
import type { OrgSettings } from "../types";
import { useOrgSettings, useUpdateOrgSettings } from "./queries";
import { btnPrimary, inp } from "./ui";

// --- Auto-sizing textarea ---

function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.max(60, el.scrollHeight) + "px"; }
  }, []);
  useEffect(() => { resize(); }, [value, resize]);
  return (
    <textarea ref={ref} className={className} value={value}
      onChange={(e) => onChange(e.target.value)} onInput={resize}
      placeholder={placeholder} rows={1} style={{ overflow: "hidden", resize: "none" }} />
  );
}

// --- Component ---

export default function Settings() {
  const { data: settings, isLoading } = useOrgSettings();
  const updateSettings = useUpdateOrgSettings();

  const [form, setForm] = useState<Partial<OrgSettings>>({
    tech_stack: "",
    framework: "",
    mcp_sdk_version: "",
    deployment: "",
    communication: "MCP (Model Context Protocol)",
    error_handling: "",
    retry_strategy: "",
    logging: "",
    auth_pattern: "",
    coding_standards: "",
    org_rules: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings || loaded) return;
    setForm({
      tech_stack: settings.tech_stack || "",
      framework: settings.framework || "",
      mcp_sdk_version: settings.mcp_sdk_version || "",
      deployment: settings.deployment || "",
      communication: settings.communication || "MCP (Model Context Protocol)",
      error_handling: settings.error_handling || "",
      retry_strategy: settings.retry_strategy || "",
      logging: settings.logging || "",
      auth_pattern: settings.auth_pattern || "",
      coding_standards: settings.coding_standards || "",
      org_rules: settings.org_rules || "",
    });
    setLoaded(true);
  }, [settings, loaded]);

  const set = (key: keyof OrgSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      alert("Save failed: " + (e instanceof Error ? e.message : "unknown error"));
    }
  };

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Organization Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            These standards apply to all generated agent specifications. Configure once, every agent follows the same architecture.
          </p>
        </div>
        <button className={btnPrimary} onClick={handleSave} disabled={updateSettings.isPending}>
          {saved ? "Saved!" : updateSettings.isPending ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Fields */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tech Stack</label>
            <input className={inp} value={form.tech_stack || ""} onChange={(e) => set("tech_stack", e.target.value)} placeholder="e.g. Python 3.12" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Framework</label>
            <input className={inp} value={form.framework || ""} onChange={(e) => set("framework", e.target.value)} placeholder="e.g. FastAPI + MCP SDK + anthropic SDK" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">MCP SDK Version</label>
            <input className={inp} value={form.mcp_sdk_version || ""} onChange={(e) => set("mcp_sdk_version", e.target.value)} placeholder="e.g. 1.x" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deployment</label>
            <input className={inp} value={form.deployment || ""} onChange={(e) => set("deployment", e.target.value)} placeholder="e.g. Docker containers" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Communication Protocol</label>
          <input className={`${inp} bg-gray-50 text-gray-500`} value={form.communication || "MCP (Model Context Protocol)"} readOnly />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Error Handling</label>
          <AutoTextarea className={inp} value={form.error_handling || ""} onChange={(v) => set("error_handling", v)} placeholder="e.g. Retry once on 5xx, return graceful error message to user on failure" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Retry Strategy</label>
          <AutoTextarea className={inp} value={form.retry_strategy || ""} onChange={(v) => set("retry_strategy", v)} placeholder="e.g. Exponential backoff, max 3 retries" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Logging</label>
          <AutoTextarea className={inp} value={form.logging || ""} onChange={(v) => set("logging", v)} placeholder="e.g. Structured JSON logs, correlation IDs" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Authentication Pattern</label>
          <AutoTextarea className={inp} value={form.auth_pattern || ""} onChange={(v) => set("auth_pattern", v)} placeholder="e.g. API keys from environment variables" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Coding Standards</label>
          <AutoTextarea className={inp} value={form.coding_standards || ""} onChange={(v) => set("coding_standards", v)} placeholder="e.g. Type hints required, docstrings on all public functions" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Organization-Specific Rules</label>
          <AutoTextarea className={inp} value={form.org_rules || ""} onChange={(v) => set("org_rules", v)} placeholder="e.g. All agents must log to central observability platform" />
        </div>
      </div>
    </div>
  );
}
