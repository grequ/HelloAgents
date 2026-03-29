import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSpecs, useAgents, useAllInteractions, useAllTools } from "./queries";
import type { AgentSpec, Agent, AgentTool } from "../types";
import type { InteractionRow } from "./api";

// --- Types ---

interface ToolDef { name: string; description?: string }

interface MapNode {
  id: string;
  name: string;
  agentRole: string;
  tools: ToolDef[];
  connectedAgents: string[];
  status: string;
  linkTo: string;
  hasSpec: boolean;
  x: number;
  y: number;
}

interface Edge {
  fromId: string;
  toId: string;
}

// --- Layout constants ---

const CARD_W = 280;
const CARD_MIN_H = 100;
const GAP_X = 120;
const GAP_Y = 80;
const TOOL_LINE_H = 20;
const CARD_HEADER = 48;
const CARD_PADDING_BOTTOM = 16;

function cardHeight(node: MapNode): number {
  const items = node.agentRole === "orchestrator" ? node.connectedAgents : node.tools;
  const linesH = Math.max(items.length, 1) * TOOL_LINE_H;
  return Math.max(CARD_MIN_H, CARD_HEADER + linesH + CARD_PADDING_BOTTOM);
}

function parseTools(toolsJson: unknown): ToolDef[] {
  if (!Array.isArray(toolsJson)) return [];
  return toolsJson
    .filter((t): t is { name: string; description?: string } => t && typeof t.name === "string")
    .map((t) => ({ name: t.name, description: t.description }));
}

// --- Build a map of orchestrator agent_id → connected agent names ---

function buildOrchestratorConnections(agents: Agent[], interactions: InteractionRow[]): Map<string, string[]> {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const connMap = new Map<string, string[]>();

  for (const agent of agents) {
    if (agent.agent_role === "orchestrator") {
      const names: string[] = [];
      const seen = new Set<string>();
      for (const row of interactions) {
        // Orchestrator calls another agent (from = orchestrator, to = target)
        if (row.from_agent_id === agent.id && row.from_agent_id !== row.to_agent_id) {
          const target = agentById.get(row.to_agent_id);
          if (target && !seen.has(target.id)) {
            seen.add(target.id);
            names.push(target.name);
          }
        }
        // Agent provides to orchestrator (to = orchestrator)
        if (row.to_agent_id === agent.id && row.from_agent_id !== row.to_agent_id) {
          const source = agentById.get(row.from_agent_id);
          if (source && !seen.has(source.id)) {
            seen.add(source.id);
            names.push(source.name);
          }
        }
      }
      connMap.set(agent.id, names);
    }
  }
  return connMap;
}

// --- Build nodes from agents (primary) enriched with spec data ---

function buildNodes(agents: Agent[], specs: AgentSpec[], interactions: InteractionRow[], allTools: AgentTool[]): MapNode[] {
  // Map agent_id → spec (best match)
  const agentToSpec = new Map<string, AgentSpec>();
  for (const spec of specs) {
    for (const aid of spec.agent_ids || []) {
      agentToSpec.set(aid, spec);
    }
  }

  // Map agent_id → persisted tools
  const agentToTools = new Map<string, ToolDef[]>();
  for (const tool of allTools) {
    const list = agentToTools.get(tool.agent_id) || [];
    list.push({ name: tool.name, description: tool.description });
    agentToTools.set(tool.agent_id, list);
  }

  const orchConnections = buildOrchestratorConnections(agents, interactions);

  return agents.map((agent) => {
    const spec = agentToSpec.get(agent.id);
    // Priority: persisted tools > spec tools > empty
    const persistedTools = agentToTools.get(agent.id);
    const specTools = spec ? parseTools(spec.tools_json) : [];
    const tools = persistedTools && persistedTools.length > 0 ? persistedTools : specTools;

    return {
      id: agent.id,
      name: agent.name,
      agentRole: agent.agent_role,
      tools,
      connectedAgents: orchConnections.get(agent.id) || [],
      status: spec ? spec.status : agent.status,
      linkTo: `/workbench/agents/${agent.id}`,
      hasSpec: !!spec,
      x: 0,
      y: 0,
    };
  });
}

// --- Build edges directly from interactions (agent-to-agent) ---

function buildEdges(agents: Agent[], interactions: InteractionRow[]): Edge[] {
  const agentIds = new Set(agents.map((a) => a.id));
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const row of interactions) {
    if (agentIds.has(row.from_agent_id) && agentIds.has(row.to_agent_id) && row.from_agent_id !== row.to_agent_id) {
      const key = `${row.from_agent_id}→${row.to_agent_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ fromId: row.from_agent_id, toId: row.to_agent_id });
      }
    }
  }
  return edges;
}

// --- Layout nodes in layers ---

function layoutNodes(nodes: MapNode[], edges: Edge[]): void {
  const calledBy = new Map<string, Set<string>>();
  for (const n of nodes) calledBy.set(n.id, new Set());
  for (const e of edges) calledBy.get(e.toId)?.add(e.fromId);

  const layers: string[][] = [];
  const assigned = new Set<string>();

  // Layer 0: not called by anyone
  const roots = nodes.filter((n) => (calledBy.get(n.id)?.size || 0) === 0);
  if (roots.length > 0) {
    layers.push(roots.map((n) => n.id));
    roots.forEach((n) => assigned.add(n.id));
  }

  let depth = 0;
  while (assigned.size < nodes.length && depth < 10) {
    const next: string[] = [];
    for (const n of nodes) {
      if (!assigned.has(n.id)) {
        const callers = calledBy.get(n.id)!;
        if ([...callers].some((c) => assigned.has(c))) {
          next.push(n.id);
          assigned.add(n.id);
        }
      }
    }
    if (next.length > 0) layers.push(next);
    else break;
    depth++;
  }
  const rest = nodes.filter((n) => !assigned.has(n.id));
  if (rest.length > 0) layers.push(rest.map((n) => n.id));

  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  let currentY = 40;

  for (const layer of layers) {
    let maxH = 0;
    for (let i = 0; i < layer.length; i++) {
      const node = nodeById[layer[i]];
      if (!node) continue;
      node.x = 40 + i * (CARD_W + GAP_X);
      node.y = currentY;
      maxH = Math.max(maxH, cardHeight(node));
    }
    currentY += maxH + GAP_Y;
  }
}

// --- Component ---

export default function AgentMap() {
  const { data: specs = [], isLoading: specsLoading } = useSpecs();
  const { data: agents = [], isLoading: agentsLoading } = useAgents();
  const { data: interactions = [], isLoading: intLoading } = useAllInteractions();
  const { data: allTools = [], isLoading: toolsLoading } = useAllTools();

  const nodes = useMemo(() => buildNodes(agents, specs, interactions, allTools), [agents, specs, interactions, allTools]);
  const edges = useMemo(() => buildEdges(agents, interactions), [agents, interactions]);

  useMemo(() => layoutNodes(nodes, edges), [nodes, edges]);

  if (specsLoading || agentsLoading || intLoading || toolsLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  if (agents.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <div className="text-4xl mb-3 opacity-40">&#128506;</div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">No agents to map yet</h2>
          <p className="text-sm text-gray-500 mb-4">Create agents on the Dashboard first.</p>
          <Link to="/workbench" className="px-4 py-2 rounded-lg bg-tedee-cyan text-tedee-navy font-semibold text-sm hover:bg-hover-cyan transition-colors inline-block">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

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
  svgWidth = Math.max(svgWidth, Math.max(...nodes.map((n) => n.x + CARD_W)) + 80);

  return (
    <div className="max-w-full mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto p-4">
        <svg width={svgWidth} height={svgHeight} className="block" style={{ minWidth: svgWidth, minHeight: svgHeight }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0.5, 7 3, 0 5.5" fill="#94a3b8" />
            </marker>
            <filter id="cardShadow" x="-4%" y="-4%" width="108%" height="112%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const from = nodeMap[edge.fromId];
            const to = nodeMap[edge.toId];
            if (!from || !to) return null;

            const fromCX = from.x + CARD_W / 2;
            const fromBottom = from.y + cardHeight(from);
            const toCX = to.x + CARD_W / 2;
            const toTop = to.y;

            if (from.y === to.y) {
              const fromRight = from.x + CARD_W;
              const toLeft = to.x;
              const goRight = fromRight < toLeft;
              const sx = goRight ? fromRight : from.x;
              const ex = goRight ? toLeft : to.x + CARD_W;
              const sy = from.y + cardHeight(from) / 2;
              const ey = to.y + cardHeight(to) / 2;
              return <line key={i} x1={sx} y1={sy} x2={ex} y2={ey} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />;
            }

            const midY = (fromBottom + toTop) / 2;
            return (
              <path key={i}
                d={`M ${fromCX} ${fromBottom} C ${fromCX} ${midY}, ${toCX} ${midY}, ${toCX} ${toTop}`}
                fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
            );
          })}

          {/* Nodes -- every agent appears, with or without a spec */}
          {nodes.map((node) => {
            const h = cardHeight(node);
            const nameText = node.name.length > 28 ? node.name.slice(0, 26) + "..." : node.name;
            const isOrchestrator = node.agentRole === "orchestrator";

            const statusColor = node.hasSpec
              ? (node.status === "generated" ? { bg: "#dcfce7", text: "#166534" } : { bg: "#f3f4f6", text: "#6b7280" })
              : { bg: "#fef3c7", text: "#92400e" };
            const statusLabel = node.hasSpec ? node.status : "no spec";

            const topBarColor = isOrchestrator ? "#7c3aed" : "#34CFFD";
            const borderColor = node.hasSpec
              ? (isOrchestrator ? "#c4b5fd" : "#e5e7eb")
              : "#fde68a";

            const sectionLabel = isOrchestrator ? "CONNECTED" : "TOOLS";
            const items = isOrchestrator ? node.connectedAgents : node.tools;
            const emptyText = isOrchestrator
              ? (node.hasSpec ? "(no connected agents)" : "(generate spec to see connections)")
              : "(no tools yet)";

            return (
              <g key={node.id} className="cursor-pointer">
                <rect x={node.x} y={node.y} width={CARD_W} height={h} rx={12} ry={12}
                  fill="white" stroke={borderColor} strokeWidth={1}
                  filter="url(#cardShadow)" />
                <rect x={node.x + 1} y={node.y + 1} width={CARD_W - 2} height={5} rx={2}
                  fill={topBarColor} />

                <a href={node.linkTo}>
                  <text x={node.x + 16} y={node.y + 30} fontSize={14} fontWeight={700} fill="#22345A">
                    {nameText}
                  </text>
                </a>

                {/* Status badge */}
                <rect x={node.x + CARD_W - 16 - statusLabel.length * 6.5}
                  y={node.y + 12} width={statusLabel.length * 6.5 + 12} height={18} rx={9}
                  fill={statusColor.bg} />
                <text x={node.x + CARD_W - 10} y={node.y + 25}
                  fontSize={9} fontWeight={500} textAnchor="end" fill={statusColor.text}>
                  {statusLabel}
                </text>

                {/* Section: Tools or Connected Agents */}
                <text x={node.x + 16} y={node.y + CARD_HEADER} fontSize={10} fill="#A9A9A9"
                  fontWeight={600} letterSpacing="0.05em">{sectionLabel}</text>
                {items.length > 0 ? items.map((item, ti) => {
                  const label = typeof item === "string" ? item : item.name;
                  return (
                    <text key={ti} x={node.x + 16} y={node.y + CARD_HEADER + 16 + ti * TOOL_LINE_H}
                      fontSize={12} fill="#1e293b" fontFamily="'Cascadia Code','Fira Code',monospace">
                      {label}
                    </text>
                  );
                }) : (
                  <text x={node.x + 16} y={node.y + CARD_HEADER + 16} fontSize={12} fill="#9ca3af" fontStyle="italic">
                    {emptyText}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-1.5 rounded" style={{ backgroundColor: "#34CFFD" }} />
          <span>Operator</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-1.5 rounded" style={{ backgroundColor: "#7c3aed" }} />
          <span>Orchestrator</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="32" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#94a3b8" strokeWidth={1.5} /><polygon points="26,1 32,4 26,7" fill="#94a3b8" /></svg>
          <span>orchestrates</span>
        </div>
        <span className="text-gray-400">Click agent name to open detail</span>
      </div>
    </div>
  );
}
