import { Link } from "react-router-dom";
import { useSpecs } from "./queries";

export default function AgentSpecList() {
  const { data: specs = [], isLoading } = useSpecs();

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {specs.map((s) => (
          <Link
            to={`/workbench/specs/${s.id}`}
            key={s.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 block no-underline hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="font-semibold text-text-primary text-sm">{s.name}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.status === "generated" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"}`}>
                {s.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
              <span>{(s.agent_ids || []).length} agents</span>
              <span>{(s.use_case_ids || []).length} use cases</span>
              {s.generated_at && <span>{new Date(s.generated_at).toLocaleDateString()}</span>}
            </div>
          </Link>
        ))}
      </div>

      {specs.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500 mb-2">No specs generated yet.</p>
          <Link to="/workbench" className="text-sm text-tedee-cyan hover:underline">
            Go to Dashboard to create agents and generate specs
          </Link>
        </div>
      )}
    </div>
  );
}
