"""Use Case Discoverer — AI-powered pipeline that analyzes an operator's API spec
and generates comprehensive use cases like a senior business consultant would.

Pipeline:
1. Analyze the system (name, description, spec) → understand what it does
2. Generate use cases with full details
3. For each use case: run Self-Discovery → run Live Test
"""

import json
import re
import anthropic

client = anthropic.Anthropic()


def _extract_json(text: str):
    """Extract JSON from a response that may contain markdown fences."""
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0]
    return json.loads(text.strip())


def _build_spec_summary(agent: dict) -> str:
    """Build a rich summary of the agent's API spec for the prompt."""
    spec = agent.get("api_spec")
    if not spec:
        return "No API spec loaded."

    is_mcp = agent.get("api_type") == "mcp"

    if is_mcp and isinstance(spec, list):
        lines = [f"MCP Server with {len(spec)} tools:\n"]
        for tool in spec:
            name = tool.get("name", "unnamed")
            desc = tool.get("description", "")
            schema = tool.get("inputSchema", {})
            params = schema.get("properties", {})
            required = schema.get("required", [])
            param_details = []
            for pname, pinfo in params.items():
                req = " (required)" if pname in required else ""
                ptype = pinfo.get("type", "unknown")
                pdesc = pinfo.get("description", "")
                param_details.append(f"      - {pname}: {ptype}{req} — {pdesc}")
            lines.append(f"  Tool: {name}")
            lines.append(f"    Description: {desc}")
            if param_details:
                lines.append("    Parameters:")
                lines.extend(param_details)
            lines.append("")
        return "\n".join(lines)

    if isinstance(spec, dict) and "paths" in spec:
        info = spec.get("info", {})
        lines = []
        if info.get("title"):
            lines.append(f"API: {info['title']}")
        if info.get("description"):
            lines.append(f"Description: {info['description']}")

        paths = spec.get("paths", {})
        lines.append(f"\n{len(paths)} API endpoints:\n")
        for path, methods in paths.items():
            for method, details in methods.items():
                if method not in ("get", "post", "put", "patch", "delete"):
                    continue
                summary = details.get("summary", details.get("description", ""))[:120]
                params = details.get("parameters", [])
                param_names = [p.get("name", "") for p in params[:5]]
                body = details.get("requestBody", {})
                lines.append(f"  {method.upper()} {path}")
                lines.append(f"    {summary}")
                if param_names:
                    lines.append(f"    Params: {', '.join(param_names)}")
                if body:
                    lines.append(f"    Has request body")
                # Response schema hints
                responses = details.get("responses", {})
                for code, resp in responses.items():
                    if code.startswith("2"):
                        resp_desc = resp.get("description", "")[:80]
                        if resp_desc:
                            lines.append(f"    → {code}: {resp_desc}")
                        break
                lines.append("")
        return "\n".join(lines)

    return f"Spec loaded ({type(spec).__name__}), but format not recognized for summary."


async def discover_use_cases(agent: dict) -> list[dict]:
    """Phase 1 & 2: Analyze the system and generate use cases.

    Returns a list of use case dicts ready for create_use_case():
    [{name, description, trigger_text, user_input, expected_output, frequency, sample_conversation}]
    """
    spec_summary = _build_spec_summary(agent)
    is_mcp = agent.get("api_type") == "mcp"
    system_type = "MCP server" if is_mcp else "REST API"

    # Phase 1: Deep system analysis + Phase 2: Use case generation (combined for efficiency)
    prompt = f"""You are a senior business consultant and subject matter expert analyzing
a {system_type} to identify every meaningful use case an AI agent could serve.

## System Under Analysis

**Name:** {agent.get('name', 'Unknown')}
**Description:** {agent.get('description', 'No description')}
**Type:** {agent.get('api_type', 'unknown')}
**Base URL:** {agent.get('api_base_url', 'N/A')}

## Complete API Specification

{spec_summary}

## Your Task

First, deeply understand what this system does — its domain, its data model, its capabilities,
its business purpose. Think about who uses it and why.

Then generate a comprehensive set of use cases. Think like a business consultant who has been
hired to maximize the value of wrapping this system with an AI agent. Consider:

1. **Primary operations** — the obvious CRUD and query operations each endpoint enables
2. **Composite workflows** — multi-step operations that chain endpoints together
   (e.g. "look up customer, then check their orders, then summarize")
3. **Analytics & insights** — aggregation, comparison, trend analysis across data
4. **Error recovery & edge cases** — what happens when data is missing, invalid, or conflicting
5. **Business-critical scenarios** — the operations that matter most to the organization
6. **Cross-entity operations** — operations that span multiple resource types

For each use case, provide:
- **name**: Clear, action-oriented (e.g. "Look up customer order status", not "Orders")
- **description**: 1-2 sentences explaining the business value
- **trigger_text**: The exact user message or event that would trigger this
- **user_input**: What specific data the user provides (be precise — "Order ID" not "some ID")
- **expected_output**: What the response should contain (specific fields, not vague descriptions)
- **frequency**: Realistic estimate (e.g. "~200/day", "~50/week")
- **sample_conversation**: A realistic 3-4 turn dialogue:
  User: ...
  Agent: ...
  User: ...
  Agent: ...

Generate between 5 and 15 use cases, depending on the complexity of the API.
Quality over quantity — each use case should be distinct and valuable.

Return a JSON array of use case objects. Return ONLY the JSON array, no markdown fences."""

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=16000,
        messages=[{"role": "user", "content": prompt}],
    )

    if not response.content:
        raise ValueError("Empty response from AI")

    text = response.content[0].text.strip()
    # Strip markdown fences
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)

    try:
        use_cases = json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON array in the text
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            use_cases = json.loads(text[start:end + 1])
        else:
            raise ValueError("Failed to parse AI response as JSON array")

    if not isinstance(use_cases, list):
        raise ValueError("Expected JSON array of use cases")

    return use_cases


def _build_connected_agents_context(connected_agents: list[dict], all_tools: list[dict], all_use_cases: list[dict]) -> str:
    """Build a rich context of what connected agents can do."""
    lines = []
    for ag in connected_agents:
        role = ag.get("agent_role", "operator")
        lines.append(f"### {ag['name']} ({role})")
        lines.append(f"Description: {ag.get('description', 'No description')}")

        # Tools for this agent
        agent_tools = [t for t in all_tools if t.get("agent_id") == ag["id"]]
        if agent_tools:
            lines.append(f"Tools ({len(agent_tools)}):")
            for t in agent_tools:
                lines.append(f"  - {t['name']}: {t.get('description', '')}")

        # Completed use cases for this agent
        agent_ucs = [uc for uc in all_use_cases if uc.get("agent_id") == ag["id"] and uc.get("status") == "completed"]
        if agent_ucs:
            lines.append(f"Completed use cases ({len(agent_ucs)}):")
            for uc in agent_ucs:
                lines.append(f"  - {uc['name']}: {uc.get('description', '')}")
                if uc.get("trigger_text"):
                    lines.append(f"    Trigger: {uc['trigger_text']}")

        # API spec summary (brief)
        spec = ag.get("api_spec")
        if spec and isinstance(spec, list):
            lines.append(f"MCP tools available: {len(spec)}")
        elif spec and isinstance(spec, dict) and "paths" in spec:
            lines.append(f"API endpoints available: {len(spec['paths'])}")

        lines.append("")

    return "\n".join(lines) if lines else "No connected agents."


async def discover_orchestrator_use_cases(
    agent: dict,
    connected_agents: list[dict],
    all_tools: list[dict],
    all_use_cases: list[dict],
) -> list[dict]:
    """Generate use cases for an orchestrator based on its connected agents' capabilities."""

    agents_context = _build_connected_agents_context(connected_agents, all_tools, all_use_cases)
    persona = ""
    if agent.get("agent_config"):
        config = agent["agent_config"]
        if isinstance(config, dict):
            persona = config.get("agent_persona", "")

    prompt = f"""You are a senior business consultant designing end-to-end user scenarios for
an AI orchestrator agent. This orchestrator delegates work to connected agents (operators and
other orchestrators) to serve end-user requests.

## Orchestrator Under Analysis

**Name:** {agent.get('name', 'Unknown')}
**Description:** {agent.get('description', 'No description')}
**Persona:** {persona or 'Not defined'}

## Connected Agents and Their Capabilities

{agents_context}

## Your Task

First, deeply understand what each connected agent can do — its tools, its completed use cases,
its data domain. Then think about what end-to-end user scenarios become possible when these
agents work together through this orchestrator.

Generate use cases with this priority:

1. **Cross-agent workflows** (HIGHEST priority) — scenarios that require 2+ connected agents
   working together (e.g. "look up order from OrderManagement, then get product details from
   ProductCatalog to assess return eligibility")
2. **Single-agent delegations** — straightforward scenarios that route to one agent
3. **Aggregation scenarios** — scenarios that query multiple agents and combine results
4. **Error handling & escalation** — what happens when an agent can't handle the request
5. **Complex multi-step orchestrations** — scenarios with conditional routing
   (e.g. "if product is in stock, create order; if not, check alternatives")

For each use case, provide:
- **name**: Clear, action-oriented, from the end-user's perspective
- **description**: 1-2 sentences explaining which agents are involved and why
- **trigger_text**: The exact user message that triggers this
- **user_input**: What the user provides
- **expected_output**: What the orchestrator delivers back (combining data from multiple agents)
- **frequency**: Realistic estimate
- **sample_conversation**: A realistic 3-4 turn dialogue showing the orchestrator coordinating:
  User: ...
  Agent: (routes to OperatorA, then OperatorB) ...
  User: ...
  Agent: ...

Generate between 5 and 12 use cases. Focus on scenarios that demonstrate the VALUE of having
an orchestrator — don't just repeat individual operator use cases.

Return a JSON array of use case objects. Return ONLY the JSON array, no markdown fences."""

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=16000,
        messages=[{"role": "user", "content": prompt}],
    )

    if not response.content:
        raise ValueError("Empty response from AI")

    text = response.content[0].text.strip()
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)

    try:
        use_cases = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            use_cases = json.loads(text[start:end + 1])
        else:
            raise ValueError("Failed to parse AI response as JSON array")

    if not isinstance(use_cases, list):
        raise ValueError("Expected JSON array of use cases")

    return use_cases
