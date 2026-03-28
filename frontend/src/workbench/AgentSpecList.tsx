import { Link } from "react-router-dom";
import { useSpecs } from "./queries";

export default function AgentSpecList() {
  const { data: specs = [], isLoading } = useSpecs();

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="space-y-3">
        {specs.map((s) => (
          <Link
            to={`/workbench/agents/${s.id}`}
            key={s.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 block no-underline hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-1">
              <span className="font-semibold text-text-primary text-sm">{s.name}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
                {s.status}
              </span>
            </div>
            <div className="flex gap-3 text-[11px] text-gray-400">
              <span>{(s.system_ids || []).length} systems</span>
              <span>{(s.use_case_ids || []).length} use cases</span>
              <span>{s.generated_at ? new Date(s.generated_at).toLocaleDateString() : ""}</span>
            </div>
          </Link>
        ))}
      </div>

      {specs.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500 mb-2">No specs generated yet.</p>
          <Link to="/workbench" className="text-sm text-tedee-cyan hover:underline">
            Go to Dashboard to create systems and generate specs
          </Link>
        </div>
      )}
    </div>
  );
}
