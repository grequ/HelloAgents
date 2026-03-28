import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSpecs, useSystems, useAllInteractions } from "./queries";
import type { AgentSpec, System } from "../types";
import type { InteractionRow } from "./api";

// --- Types ---

interface ToolDef { name: string; description?: string }

interface AgentNode {
  spec: AgentSpec;
  tools: ToolDef[];
  systemNames: string[];
  x: number;
  y: number;
}

interface Edge {
  fromSpecId: string;
  toSpecId: string;
}

// --- Layout constants ---

const CARD_W = 280;
const CARD_MIN_H = 120;
const GAP_X = 120;
const GAP_Y = 80;
const TOOL_LINE_H = 20;
const SYSTEM_LINE_H = 18;
const CARD_HEADER = 48;
const CARD_PADDING_BOTTOM = 16;

function cardHeight(node: AgentNode): number {
  const toolsH = Math.max(node.tools.length, 1) * TOOL_LINE_H;
  const sysH = node.systemNames.length > 0 ? 20 + node.systemNames.length * SYSTEM_LINE_H : 0;
  return Math.max(CARD_MIN_H, CARD_HEADER + toolsH + sysH + CARD_PADDING_BOTTOM);
}

function parseTools(toolsJson: unknown): ToolDef[] {
  if (!Array.isArray(toolsJson)) return [];
  return toolsJson
    .filter((t): t is { name: string; description?: string } => t && typeof t.name === "string")
    .map((t) => ({ name: t.name, description: t.description }));
}

// --- Build edges from DB interactions ---

function buildEdges(
  specs: AgentSpec[],
  interactions: InteractionRow[],
): Edge[] {
  // Map system_id → spec_id
  const systemToSpec = new Map<string, string>();
  for (const spec of specs) {
    for (const sid of spec.system_ids || []) {
      systemToSpec.set(sid, spec.id);
    }
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const row of interactions) {
    const fromSpec = systemToSpec.get(row.from_system_id);
    const toSpec = systemToSpec.get(row.to_system_id);
    if (fromSpec && toSpec && fromSpec !== toSpec) {
      const key = `${fromSpec}→${toSpec}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ fromSpecId: fromSpec, toSpecId: toSpec });
      }
    }
  }
  return edges;
}

// --- Layout nodes in layers ---

function layoutNodes(
  specs: AgentSpec[],
  systemsById: Record<string, System>,
  edges: Edge[],
): AgentNode[] {
  // Build adjacency for layering
  const calledBy = new Map<string, Set<string>>();
  for (const spec of specs) calledBy.set(spec.id, new Set());
  for (const e of edges) calledBy.get(e.toSpecId)?.add(e.fromSpecId);

  const layers: string[][] = [];
  const assigned = new Set<string>();

  // Layer 0: nodes not called by anyone (roots/orchestrators)
  const roots = specs.filter((s) => (calledBy.get(s.id)?.size || 0) === 0);
  if (roots.length > 0) {
    layers.push(roots.map((s) => s.id));
    roots.forEach((s) => assigned.add(s.id));
  }

  // BFS for subsequent layers
  let depth = 0;
  while (assigned.size < specs.length && depth < 10) {
    const cur = layers[depth] || [];
    const next: string[] = [];
    for (const s of specs) {
      if (!assigned.has(s.id) && calledBy.get(s.id)?.size) {
        // All callers assigned?
        const callers = calledBy.get(s.id)!;
        if ([...callers].some((c) => assigned.has(c))) {
          next.push(s.id);
          assigned.add(s.id);
        }
      }
    }
    if (next.length > 0) layers.push(next);
    else break;
    depth++;
  }
  // Remaining
  const rest = specs.filter((s) => !assigned.has(s.id));
  if (rest.length > 0) layers.push(rest.map((s) => s.id));

  const specById = Object.fromEntries(specs.map((s) => [s.id, s]));
  const nodes: AgentNode[] = [];
  let currentY = 40;

  for (const layer of layers) {
    let maxH = 0;
    for (let i = 0; i < layer.length; i++) {
      const spec = specById[layer[i]];
      if (!spec) continue;
      const tools = parseTools(spec.tools_json);
      const systemNames = (spec.system_ids || []).map((sid) => systemsById[sid]?.name).filter(Boolean) as string[];
      const node: AgentNode = { spec, tools, systemNames, x: 40 + i * (CARD_W + GAP_X), y: currentY };
      nodes.push(node);
      maxH = Math.max(maxH, cardHeight(node));
    }
    currentY += maxH + GAP_Y;
  }
  return nodes;
}

// --- Component ---

export default function AgentMap() {
  const { data: specs = [], isLoading: specsLoading } = useSpecs();
  const { data: systems = [], isLoading: systemsLoading } = useSystems();
  const { data: interactions = [], isLoading: intLoading } = useAllInteractions();

  const systemsById = useMemo(() => Object.fromEntries(systems.map((s) => [s.id, s])), [systems]);
  const edges = useMemo(() => buildEdges(specs, interactions), [specs, interactions]);
  const nodes = useMemo(() => layoutNodes(specs, systemsById, edges), [specs, systemsById, edges]);

  if (specsLoading || systemsLoading || intLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  if (specs.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <div className="text-4xl mb-3 opacity-40">&#128506;</div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">No agents to map yet</h2>
          <p className="text-sm text-gray-500 mb-4">Generate agent specs from your systems first.</p>
          <Link to="/workbench" className="px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan transition-colors inline-block">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.spec.id, n]));

  // SVG dimensions
  let svgWidth = Math.max(800, Math.max(...nodes.map((n) => n.x + CARD_W)) + 80);
  const svgHeight = Math.max(400, Math.max(...nodes.map((n) => n.y + cardHeight(n))) + 80);

  // Center layers
  const layerYs = [...new Set(nodes.map((n) => n.y))];
  for (const ly of layerYs) {
    const lnodes = nodes.filter((n) => n.y === ly);
    const totalW = lnodes.length * CARD_W + (lnodes.length - 1) * GAP_X;
    const offset = Math.max(0, (svgWidth - totalW) / 2 - lnodes[0].x);
    for (const n of lnodes) n.x += offset;
  }
  // Recalc width after centering
  svgWidth = Math.max(svgWidth, Math.max(...nodes.map((n) => n.x + CARD_W)) + 80);

  return (
    <div className="max-w-full mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto p-4">
        <svg width={svgWidth} height={svgHeight} className="block" style={{ minWidth: svgWidth, minHeight: svgHeight }}>
          <defs>
            <marker id="arrow" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto">
              <polygon points="0 0, 12 4, 0 8" fill="#34CFFD" />
            </marker>
            <filter id="cardShadow" x="-4%" y="-4%" width="108%" height="112%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* Edges — solid cyan lines with arrows */}
          {edges.map((edge, i) => {
            const from = nodeMap[edge.fromSpecId];
            const to = nodeMap[edge.toSpecId];
            if (!from || !to) return null;

            const fromCX = from.x + CARD_W / 2;
            const fromBottom = from.y + cardHeight(from);
            const toCX = to.x + CARD_W / 2;
            const toTop = to.y;

            // If same row (horizontal), draw side-to-side
            if (from.y === to.y) {
              const fromRight = from.x + CARD_W;
              const toLeft = to.x;
              const goRight = fromRight < toLeft;
              const sx = goRight ? fromRight : from.x;
              const ex = goRight ? toLeft : to.x + CARD_W;
              const sy = from.y + cardHeight(from) / 2;
              const ey = to.y + cardHeight(to) / 2;
              return (
                <line key={i} x1={sx} y1={sy} x2={ex} y2={ey}
                  stroke="#34CFFD" strokeWidth={2.5} markerEnd="url(#arrow)" />
              );
            }

            // Vertical — curved bezier
            const midY = (fromBottom + toTop) / 2;
            return (
              <path key={i}
                d={`M ${fromCX} ${fromBottom} C ${fromCX} ${midY}, ${toCX} ${midY}, ${toCX} ${toTop}`}
                fill="none" stroke="#34CFFD" strokeWidth={2.5} markerEnd="url(#arrow)" />
            );
          })}

          {/* Agent cards */}
          {nodes.map((node) => {
            const h = cardHeight(node);
            const nameText = node.spec.name.length > 28 ? node.spec.name.slice(0, 26) + "..." : node.spec.name;

            return (
              <g key={node.spec.id} className="cursor-pointer">
                {/* Card bg */}
                <rect x={node.x} y={node.y} width={CARD_W} height={h} rx={12} ry={12}
                  fill="white" stroke="#e5e7eb" strokeWidth={1} filter="url(#cardShadow)" />
                {/* Cyan top bar */}
                <rect x={node.x + 1} y={node.y + 1} width={CARD_W - 2} height={5} rx={2} fill="#34CFFD" />

                {/* Agent name */}
                <a href={`/workbench/agents/${node.spec.id}`}>
                  <text x={node.x + 16} y={node.y + 30} fontSize={14} fontWeight={700} fill="#22345A">
                    {nameText}
                  </text>
                </a>

                {/* Status badge — top-right, below the cyan bar */}
                <rect x={node.x + CARD_W - 16 - node.spec.status.length * 6.5}
                  y={node.y + 12} width={node.spec.status.length * 6.5 + 12} height={18} rx={9}
                  fill={node.spec.status === "generated" ? "#dcfce7" : "#f3f4f6"} />
                <text x={node.x + CARD_W - 10} y={node.y + 25}
                  fontSize={9} fontWeight={500} textAnchor="end"
                  fill={node.spec.status === "generated" ? "#166534" : "#6b7280"}>
                  {node.spec.status}
                </text>

                {/* Tools */}
                <text x={node.x + 16} y={node.y + CARD_HEADER} fontSize={10} fill="#A9A9A9"
                  fontWeight={600} letterSpacing="0.05em">TOOLS</text>
                {node.tools.length > 0 ? node.tools.map((tool, ti) => (
                  <text key={ti} x={node.x + 16} y={node.y + CARD_HEADER + 16 + ti * TOOL_LINE_H}
                    fontSize={12} fill="#1e293b" fontFamily="'Cascadia Code','Fira Code',monospace">
                    {tool.name}
                  </text>
                )) : (
                  <text x={node.x + 16} y={node.y + CARD_HEADER + 16} fontSize={12} fill="#9ca3af" fontStyle="italic">
                    (no tools defined)
                  </text>
                )}

                {/* Systems */}
                {node.systemNames.length > 0 && (() => {
                  const sysY = node.y + CARD_HEADER + 16 + Math.max(node.tools.length, 1) * TOOL_LINE_H + 8;
                  return (<>
                    <text x={node.x + 16} y={sysY} fontSize={10} fill="#A9A9A9" fontWeight={600} letterSpacing="0.05em">SYSTEMS</text>
                    {node.systemNames.map((name, si) => (
                      <text key={si} x={node.x + 16} y={sysY + 14 + si * SYSTEM_LINE_H} fontSize={11} fill="#64748b">{name}</text>
                    ))}
                  </>);
                })()}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <svg width="32" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#34CFFD" strokeWidth={2.5} /><polygon points="28,0 32,4 28,8" fill="#34CFFD" /></svg>
          <span>calls / asks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-1.5 bg-tedee-cyan rounded" />
          <span>Agent</span>
        </div>
        <span className="text-gray-400">Click agent name to open spec</span>
      </div>
    </div>
  );
}
