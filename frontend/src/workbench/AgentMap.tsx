import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSpecs, useSystems } from "./queries";
import type { AgentSpec, System } from "../types";

// --- Layout helpers ---

interface ToolDef {
  name: string;
  description?: string;
}

interface AgentNode {
  spec: AgentSpec;
  tools: ToolDef[];
  systemNames: string[];
  x: number;
  y: number;
}

interface Edge {
  fromId: string;
  toId: string;
  label?: string;
}

const CARD_W = 260;
const CARD_MIN_H = 140;
const GAP_X = 100;
const GAP_Y = 60;
const TOOL_LINE_H = 20;
const SYSTEM_LINE_H = 18;
const CARD_HEADER = 48;
const CARD_PADDING_BOTTOM = 16;

function cardHeight(node: AgentNode): number {
  const toolsH = Math.max(node.tools.length, 1) * TOOL_LINE_H;
  const systemsH = node.systemNames.length > 0 ? 20 + node.systemNames.length * SYSTEM_LINE_H : 0;
  return Math.max(CARD_MIN_H, CARD_HEADER + toolsH + systemsH + CARD_PADDING_BOTTOM);
}

function layoutNodes(specs: AgentSpec[], systemsById: Record<string, System>): AgentNode[] {
  // Build adjacency to determine layers (called_by nothing = top layer)
  const calledByMap = new Map<string, string[]>();
  const dependsOnMap = new Map<string, string[]>();
  for (const s of specs) {
    calledByMap.set(s.id, s.called_by || []);
    dependsOnMap.set(s.id, s.depends_on || []);
  }

  // Assign layers: orchestrators (called by nothing) on top, called agents below
  const layers: string[][] = [];
  const assigned = new Set<string>();

  // Layer 0: specs that aren't called by any other spec
  const roots = specs.filter((s) => !s.called_by || s.called_by.length === 0);
  if (roots.length > 0) {
    layers.push(roots.map((s) => s.id));
    roots.forEach((s) => assigned.add(s.id));
  }

  // Subsequent layers by BFS
  let depth = 0;
  while (assigned.size < specs.length && depth < 10) {
    const currentLayer = layers[depth] || [];
    const nextLayer: string[] = [];
    for (const id of currentLayer) {
      const deps = dependsOnMap.get(id) || [];
      for (const depId of deps) {
        if (!assigned.has(depId) && specs.some((s) => s.id === depId)) {
          nextLayer.push(depId);
          assigned.add(depId);
        }
      }
    }
    // Also find specs called by current layer
    for (const s of specs) {
      if (!assigned.has(s.id)) {
        const cb = s.called_by || [];
        if (cb.some((cbId) => currentLayer.includes(cbId))) {
          nextLayer.push(s.id);
          assigned.add(s.id);
        }
      }
    }
    if (nextLayer.length > 0) layers.push(nextLayer);
    depth++;
  }

  // Any remaining unassigned specs go into a final layer
  const remaining = specs.filter((s) => !assigned.has(s.id));
  if (remaining.length > 0) layers.push(remaining.map((s) => s.id));

  const specById = Object.fromEntries(specs.map((s) => [s.id, s]));

  // Position nodes
  const nodes: AgentNode[] = [];
  let currentY = 40;

  for (const layer of layers) {
    const totalWidth = layer.length * CARD_W + (layer.length - 1) * GAP_X;
    let startX = Math.max(40, 40); // will center later based on SVG width
    // Center later — for now just lay out left to right
    startX = 40;

    let maxH = 0;
    for (let i = 0; i < layer.length; i++) {
      const spec = specById[layer[i]];
      if (!spec) continue;

      const tools = parseTools(spec.tools_json);
      const systemNames = (spec.system_ids || [])
        .map((sid) => systemsById[sid]?.name)
        .filter(Boolean) as string[];

      const node: AgentNode = {
        spec,
        tools,
        systemNames,
        x: startX + i * (CARD_W + GAP_X),
        y: currentY,
      };
      nodes.push(node);
      maxH = Math.max(maxH, cardHeight(node));
    }
    currentY += maxH + GAP_Y;
  }

  return nodes;
}

function parseTools(toolsJson: unknown): ToolDef[] {
  if (!Array.isArray(toolsJson)) return [];
  return toolsJson
    .filter((t): t is { name: string; description?: string } => t && typeof t.name === "string")
    .map((t) => ({ name: t.name, description: t.description }));
}

function buildEdges(specs: AgentSpec[]): Edge[] {
  const edges: Edge[] = [];
  const specIds = new Set(specs.map((s) => s.id));

  for (const spec of specs) {
    // depends_on: this agent calls those agents
    for (const depId of spec.depends_on || []) {
      if (specIds.has(depId)) {
        edges.push({ fromId: spec.id, toId: depId });
      }
    }
    // called_by: those agents call this one → edge from caller to this
    for (const callerId of spec.called_by || []) {
      if (specIds.has(callerId)) {
        // Avoid duplicate: check if we already have this edge
        if (!edges.some((e) => e.fromId === callerId && e.toId === spec.id)) {
          edges.push({ fromId: callerId, toId: spec.id });
        }
      }
    }
  }
  return edges;
}

// --- Component ---

export default function AgentMap() {
  const { data: specs = [], isLoading: specsLoading } = useSpecs();
  const { data: systems = [], isLoading: systemsLoading } = useSystems();

  const systemsById = useMemo(
    () => Object.fromEntries(systems.map((s) => [s.id, s])),
    [systems],
  );

  const nodes = useMemo(() => layoutNodes(specs, systemsById), [specs, systemsById]);
  const edges = useMemo(() => buildEdges(specs), [specs]);

  if (specsLoading || systemsLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  if (specs.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <div className="text-4xl mb-3 opacity-40">&#128506;</div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">No agents to map yet</h2>
          <p className="text-sm text-gray-500 mb-4">
            Generate agent specs from your systems first. Each generated agent will appear here with its tools and connections.
          </p>
          <Link
            to="/workbench"
            className="px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan transition-colors inline-block"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Calculate SVG dimensions
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.spec.id, n]));
  const svgWidth = Math.max(
    800,
    Math.max(...nodes.map((n) => n.x + CARD_W)) + 60,
  );
  const svgHeight = Math.max(
    400,
    Math.max(...nodes.map((n) => n.y + cardHeight(n))) + 60,
  );

  // Center layers horizontally
  const layerYs = [...new Set(nodes.map((n) => n.y))];
  for (const ly of layerYs) {
    const layerNodes = nodes.filter((n) => n.y === ly);
    const totalW = layerNodes.length * CARD_W + (layerNodes.length - 1) * GAP_X;
    const offset = (svgWidth - totalW) / 2 - layerNodes[0]?.x || 0;
    if (offset > 0) {
      for (const n of layerNodes) n.x += offset;
    }
  }

  return (
    <div className="max-w-full mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          className="block"
          style={{ minWidth: svgWidth, minHeight: svgHeight }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#A9A9A9" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const from = nodeMap[edge.fromId];
            const to = nodeMap[edge.toId];
            if (!from || !to) return null;

            const fromCX = from.x + CARD_W / 2;
            const fromCY = from.y + cardHeight(from);
            const toCX = to.x + CARD_W / 2;
            const toCY = to.y;

            // Curved path
            const midY = (fromCY + toCY) / 2;

            return (
              <path
                key={i}
                d={`M ${fromCX} ${fromCY} C ${fromCX} ${midY}, ${toCX} ${midY}, ${toCX} ${toCY}`}
                fill="none"
                stroke="#A9A9A9"
                strokeWidth={2}
                strokeDasharray="6 3"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Agent cards */}
          {nodes.map((node) => {
            const h = cardHeight(node);
            return (
              <g key={node.spec.id}>
                {/* Card background */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={CARD_W}
                  height={h}
                  rx={12}
                  ry={12}
                  fill="white"
                  stroke="#e5e7eb"
                  strokeWidth={1}
                  filter="url(#shadow)"
                />
                {/* Cyan top accent */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={CARD_W}
                  height={4}
                  rx={2}
                  fill="#34CFFD"
                />

                {/* Agent name — clickable */}
                <a href={`/workbench/agents/${node.spec.id}`}>
                  <text
                    x={node.x + 16}
                    y={node.y + 28}
                    fontSize={14}
                    fontWeight={700}
                    fill="#22345A"
                    className="cursor-pointer hover:underline"
                  >
                    {node.spec.name}
                  </text>
                </a>

                {/* Tools section */}
                <text
                  x={node.x + 16}
                  y={node.y + CARD_HEADER}
                  fontSize={10}
                  fill="#A9A9A9"
                  fontWeight={600}
                  textAnchor="start"
                  letterSpacing="0.05em"
                >
                  TOOLS
                </text>
                {node.tools.length > 0 ? (
                  node.tools.map((tool, ti) => (
                    <text
                      key={ti}
                      x={node.x + 16}
                      y={node.y + CARD_HEADER + 16 + ti * TOOL_LINE_H}
                      fontSize={12}
                      fill="#1e293b"
                      fontFamily="'Cascadia Code', 'Fira Code', monospace"
                    >
                      {tool.name}
                    </text>
                  ))
                ) : (
                  <text
                    x={node.x + 16}
                    y={node.y + CARD_HEADER + 16}
                    fontSize={12}
                    fill="#9ca3af"
                    fontStyle="italic"
                  >
                    (no tools defined)
                  </text>
                )}

                {/* Systems section */}
                {node.systemNames.length > 0 && (() => {
                  const sysY = node.y + CARD_HEADER + 16 + Math.max(node.tools.length, 1) * TOOL_LINE_H + 8;
                  return (
                    <>
                      <text
                        x={node.x + 16}
                        y={sysY}
                        fontSize={10}
                        fill="#A9A9A9"
                        fontWeight={600}
                        letterSpacing="0.05em"
                      >
                        SYSTEMS
                      </text>
                      {node.systemNames.map((name, si) => (
                        <text
                          key={si}
                          x={node.x + 16}
                          y={sysY + 14 + si * SYSTEM_LINE_H}
                          fontSize={11}
                          fill="#64748b"
                        >
                          {name}
                        </text>
                      ))}
                    </>
                  );
                })()}

                {/* Status badge */}
                <rect
                  x={node.x + CARD_W - 70}
                  y={node.y + 14}
                  width={54}
                  height={20}
                  rx={10}
                  fill={node.spec.status === "generated" ? "#dcfce7" : "#f3f4f6"}
                />
                <text
                  x={node.x + CARD_W - 43}
                  y={node.y + 28}
                  fontSize={10}
                  fill={node.spec.status === "generated" ? "#166534" : "#6b7280"}
                  textAnchor="middle"
                  fontWeight={500}
                >
                  {node.spec.status}
                </text>
              </g>
            );
          })}

          {/* Shadow filter */}
          <defs>
            <filter id="shadow" x="-4%" y="-4%" width="108%" height="108%">
              <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.06" />
            </filter>
          </defs>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 border-t-2 border-dashed border-tedee-gray" />
          <span>calls (depends on)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-tedee-cyan rounded" />
          <span>Agent card</span>
        </div>
        <span className="text-gray-400">Click agent name to open spec detail</span>
      </div>
    </div>
  );
}
