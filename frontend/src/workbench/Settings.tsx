import { useState, useEffect, useRef, useCallback } from "react";
import type { OrgSettings } from "../types";
import { useOrgSettings, useUpdateOrgSettings } from "./queries";
import { btnPrimary, inp } from "./ui";

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useOrgSettings();
  const updateSettings = useUpdateOrgSettings();

  const [form, setForm] = useState<Partial<OrgSettings>>({
    tech_stack: "", framework: "", mcp_sdk_version: "", deployment: "",
    communication: "", error_handling: "", retry_strategy: "",
    logging: "", auth_pattern: "", coding_standards: "", org_rules: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!settings || loaded) return;
    setForm({ ...settings });
    setLoaded(true);
  }, [settings, loaded]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = (key: keyof OrgSettings, value: string) => { setForm((prev) => ({ ...prev, [key]: value })); setDirty(true); };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(form);
      setDirty(false);
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
          <h2 className="text-xl font-bold text-text-primary">Organization Standards</h2>
          <p className="text-sm text-gray-500 mt-1">
            Defined once, enforced in every generated agent. Ensures consistent architecture, patterns, and quality across all operators and orchestrators.
          </p>
        </div>
        <button className={btnPrimary} onClick={handleSave} disabled={updateSettings.isPending || !dirty}>
          {saved ? "Saved!" : dirty ? "\u25CF Save" : "Save"}
        </button>
      </div>

      {/* Runtime & Infrastructure */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary text-sm">Runtime & Infrastructure</h3>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Language" hint="Primary language for all agents">
            <input className={inp} value={form.tech_stack || ""} onChange={(e) => set("tech_stack", e.target.value)} />
          </Field>
          <Field label="Framework" hint="Web framework + SDK dependencies">
            <input className={inp} value={form.framework || ""} onChange={(e) => set("framework", e.target.value)} />
          </Field>
          <Field label="MCP SDK" hint="Model Context Protocol SDK version">
            <input className={inp} value={form.mcp_sdk_version || ""} onChange={(e) => set("mcp_sdk_version", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Deployment" hint="How agents are packaged and deployed">
            <input className={inp} value={form.deployment || ""} onChange={(e) => set("deployment", e.target.value)} />
          </Field>
          <Field label="Communication" hint="Inter-agent protocol">
            <input className={`${inp} bg-gray-50 text-gray-500`} value={form.communication || ""} readOnly />
          </Field>
        </div>
      </div>

      {/* Resilience */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary text-sm">Resilience & Error Handling</h3>
        <Field label="Error Handling" hint="How agents handle failures from downstream APIs">
          <AutoTextarea className={inp} value={form.error_handling || ""} onChange={(v) => set("error_handling", v)} />
        </Field>
        <Field label="Retry & Circuit Breaker" hint="Backoff strategy, max attempts, circuit breaker thresholds">
          <AutoTextarea className={inp} value={form.retry_strategy || ""} onChange={(v) => set("retry_strategy", v)} />
        </Field>
      </div>

      {/* Observability */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary text-sm">Observability</h3>
        <Field label="Logging" hint="Log format, fields, correlation, PII handling">
          <AutoTextarea className={inp} value={form.logging || ""} onChange={(v) => set("logging", v)} />
        </Field>
      </div>

      {/* Security */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary text-sm">Security & Authentication</h3>
        <Field label="Credentials & Auth" hint="How agents handle API keys, tokens, and secrets">
          <AutoTextarea className={inp} value={form.auth_pattern || ""} onChange={(v) => set("auth_pattern", v)} />
        </Field>
      </div>

      {/* Code Quality */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary text-sm">Code Quality</h3>
        <Field label="Coding Standards" hint="Naming conventions, typing, documentation, architecture patterns">
          <AutoTextarea className={inp} value={form.coding_standards || ""} onChange={(v) => set("coding_standards", v)} />
        </Field>
      </div>

      {/* Organization Rules */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary text-sm">Organization Rules</h3>
        <Field label="Custom Rules" hint="Compliance, security policies, rate limits, domain-specific constraints">
          <AutoTextarea className={inp} value={form.org_rules || ""} onChange={(v) => set("org_rules", v)}
            placeholder="e.g. All agents must comply with GDPR data handling requirements. PII must not be stored in agent logs or passed to third-party services." />
        </Field>
      </div>
    </div>
  );
}
