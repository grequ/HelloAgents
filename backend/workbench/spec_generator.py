"""Agent spec generator — uses workbench data (tested use cases, real responses)
to generate production-ready agent specifications."""

import json
import anthropic

client = anthropic.Anthropic()


async def generate(agent_name: str, agents: list[dict], use_cases: list[dict],
                   config: dict | None = None, role: str = "operator",
                   connected_operators: list[dict] | None = None,
                   org_settings: dict | None = None) -> dict:
    """Generate a complete agent spec from agents, use cases, and config.

    role: "operator" generates an MCP server wrapping a legacy API.
          "orchestrator" generates an agent that connects to MCP operator servers.

    connected_operators: list of operator agent dicts (with api_spec/tools),
        only used for orchestrator generation.

    config may contain:
        tech_stack, framework, python_version, agent_persona, deployment,
        interactions, error_handling, auth_notes, additional_context

    Returns dict with: spec_markdown, tools_json, system_prompt, skeleton_code
    """
    config = config or {}

    if role == "orchestrator":
        return await _generate_orchestrator(
            agent_name, agents, use_cases, config, connected_operators or [],
            org_settings=org_settings,
        )
    else:
        return await _generate_operator(agent_name, agents, use_cases, config,
                                        org_settings=org_settings)

async def _generate_operator(agent_name: str, agents: list[dict],
                             use_cases: list[dict], config: dict,
                             org_settings: dict | None = None) -> dict:
    """Generate an MCP server implementation that wraps a legacy API."""

    # Build context from agents
    agents_ctx = []
    api_specs_ctx = []
    for s in agents:
        is_mcp = s.get("api_type") == "mcp"
        spec_summary = ""
        capabilities_detail = ""
        if s.get("api_spec"):
            if is_mcp and isinstance(s["api_spec"], list):
                # MCP tool definitions
                tools = s["api_spec"]
                spec_summary = f" ({len(tools)} MCP tools)"
                for tool in tools:
                    tname = tool.get("name", "unnamed")
                    tdesc = tool.get("description", "")
                    params = tool.get("inputSchema", {}).get("properties", {})
                    param_names = ", ".join(params.keys()) if params else "none"
                    capabilities_detail += f"\n  - {tname}({param_names}): {tdesc}"
            elif isinstance(s["api_spec"], dict):
                paths = s["api_spec"].get("paths", {})
                spec_summary = f" ({len(paths)} endpoints)"
                for path, methods in paths.items():
                    for method, details in methods.items():
                        if method in ("get", "post", "put", "patch", "delete"):
                            capabilities_detail += f"\n  - {method.upper()} {path}: {details.get('summary', details.get('operationId', ''))}"

        if is_mcp:
            agents_ctx.append(
                f"### {s['name']}\n"
                f"- Description: {s.get('description', '')}\n"
                f"- Type: MCP Server{spec_summary}\n"
                f"- Server URI: {s.get('api_base_url', 'N/A')}\n"
                f"- Auth: {s.get('api_auth_type', 'none')}\n"
                f"- MCP Tools:{capabilities_detail or ' N/A'}\n"
                f"- Protocol: Model Context Protocol (MCP) — connect via MCP client, NOT HTTP REST calls"
            )
        else:
            agents_ctx.append(
                f"### {s['name']}\n"
                f"- Description: {s.get('description', '')}\n"
                f"- Type: {s.get('api_type', 'rest')}{spec_summary}\n"
                f"- Base URL: {s.get('api_base_url', 'N/A')}\n"
                f"- Auth: {s.get('api_auth_type', 'none')}\n"
                f"- Endpoints:{capabilities_detail or ' N/A'}"
            )

    # Build use case context
    use_cases_ctx = []
    for uc in use_cases:
        entry = {
            "name": uc["name"],
            "description": uc.get("description", ""),
            "trigger": uc.get("trigger_text", ""),
            "user_input": uc.get("user_input", ""),
            "expected_output": uc.get("expected_output", ""),
            "is_write": uc.get("is_write", False),
            "frequency": uc.get("frequency", ""),
        }
        if uc.get("sample_conversation"):
            entry["sample_conversation"] = uc["sample_conversation"]
        if uc.get("discovered_endpoints"):
            entry["discovered_endpoints"] = uc["discovered_endpoints"]
        if uc.get("discovered_behavior"):
            entry["behavior"] = uc["discovered_behavior"]
        if uc.get("test_results"):
            latest = uc["test_results"][-1] if uc["test_results"] else None
            if latest:
                entry["tested"] = True
                entry["test_success"] = all(s.get("success") for s in latest.get("steps", []))
                # Include a sample response from the latest test
                if latest.get("steps"):
                    entry["sample_responses"] = [
                        {"endpoint": s["endpoint"], "response_sample": str(s.get("response", ""))[:500]}
                        for s in latest["steps"] if s.get("success")
                    ]
        use_cases_ctx.append(entry)

    # Build config context
    config_section = ""
    if config:
        parts = []
        if config.get("tech_stack"):
            parts.append(f"- **Language/Runtime:** {config['tech_stack']}")
        if config.get("framework"):
            parts.append(f"- **Framework:** {config['framework']}")
        if config.get("python_version"):
            parts.append(f"- **Python version:** {config['python_version']}")
        if config.get("agent_persona"):
            parts.append(f"- **Agent role/persona:** {config['agent_persona']}")
        if config.get("deployment"):
            parts.append(f"- **Deployment:** {config['deployment']}")
        if config.get("interactions"):
            parts.append(f"- **Interactions with other agents:**\n  {config['interactions']}")
        if config.get("error_handling"):
            parts.append(f"- **Error handling strategy:** {config['error_handling']}")
        if config.get("auth_notes"):
            parts.append(f"- **Authentication notes:** {config['auth_notes']}")
        if config.get("additional_context"):
            parts.append(f"- **Additional context:** {config['additional_context']}")
        if parts:
            config_section = "## Configuration & Requirements\n" + "\n".join(parts)

    # Build org settings section
    org_section = ""
    if org_settings:
        parts = []
        if org_settings.get("tech_stack"): parts.append(f"- Language/Runtime: {org_settings['tech_stack']}")
        if org_settings.get("framework"): parts.append(f"- Framework: {org_settings['framework']}")
        if org_settings.get("mcp_sdk_version"): parts.append(f"- MCP SDK: {org_settings['mcp_sdk_version']}")
        if org_settings.get("deployment"): parts.append(f"- Deployment: {org_settings['deployment']}")
        if org_settings.get("error_handling"): parts.append(f"- Error Handling: {org_settings['error_handling']}")
        if org_settings.get("retry_strategy"): parts.append(f"- Retry Strategy: {org_settings['retry_strategy']}")
        if org_settings.get("logging"): parts.append(f"- Logging: {org_settings['logging']}")
        if org_settings.get("auth_pattern"): parts.append(f"- Authentication: {org_settings['auth_pattern']}")
        if org_settings.get("coding_standards"): parts.append(f"- Coding Standards: {org_settings['coding_standards']}")
        if org_settings.get("communication"): parts.append(f"- Communication: {org_settings['communication']}")
        if org_settings.get("org_rules"): parts.append(f"- Organization Rules: {org_settings['org_rules']}")
        if parts:
            org_section = "## Organization Standards\nAll agents in this organization follow these standards:\n" + "\n".join(parts)

    # Detect MCP agents for protocol-specific instructions
    has_mcp = any(s.get("api_type") == "mcp" for s in agents)
    has_rest = any(s.get("api_type") != "mcp" for s in agents)
    protocol_note = ""
    if has_mcp:
        protocol_note = """
## MCP Protocol Note
One or more connected agents use Model Context Protocol (MCP). For MCP agents:
- Connect via MCP client (e.g. `mcp` Python SDK or `@modelcontextprotocol/sdk`), NOT via HTTP REST calls.
- The agent's tools are provided by the MCP server — call them using `session.call_tool(name, arguments)`.
- Include MCP client setup in the implementation: create a client session, connect to the server URI, list available tools.
- The skeleton code should show the MCP connection pattern alongside any REST calls.
- If the agent connects to BOTH MCP servers and REST APIs, implement both protocols.
"""

    prompt = f"""You are a senior AI architect. Generate an MCP server that wraps this legacy API and
exposes each use case as an MCP tool. This document will be given to Claude Code (an AI coding assistant)
to implement the MCP server from scratch. It must contain EVERYTHING needed — no external references.

## MCP Server Name: {agent_name}

{config_section}
{org_section}
{protocol_note}
## Legacy API to Wrap
{chr(10).join(agents_ctx)}

## Use Cases (each becomes an MCP tool)
```json
{json.dumps(use_cases_ctx, indent=2, default=str)}
```

---

Generate a JSON response with these 4 keys:

### 1. "spec_markdown"
A COMPLETE MCP server implementation specification in Markdown. This is the primary deliverable.

Structure it EXACTLY as follows:

```
# {{Agent Name}} — MCP Server Implementation Specification

## Overview
Purpose: an MCP server that wraps the legacy API below and exposes each use case as an MCP tool.

## Technology Stack
Python, `mcp` SDK, `httpx` for HTTP calls to the legacy API. Include specific versions.

## Legacy API
For EACH wrapped API: name, base URL, auth method, key endpoints with HTTP method + path + description.

## MCP Tools
For EACH tool the MCP server exposes (one per use case):
- Name (snake_case)
- Description (when to use it)
- Parameters (name, type, required, description) as MCP inputSchema
- Which legacy API endpoints it calls internally
- What it returns
- Error cases

## Implementation

### File Structure
Exactly which files to create and what each contains.

### Dependencies
requirements.txt content. Must include `mcp`, `httpx`, etc.

### Main MCP Server Code
Complete Python implementation using `mcp` SDK with:
- All imports
- `@server.tool()` decorated handlers
- HTTP calls to the legacy API inside each tool handler
- Error handling, type hints
Use ```python code blocks.

### Configuration
Environment variables needed (.env template): legacy API base URL, API keys, MCP server port, etc.

## Testing
How to verify the MCP server works. Sample MCP tool calls and expected results.
Include at least 3 test scenarios.
```

### 2. "tools_json"
MCP tool definitions as a JSON array. Each tool has: name, description, inputSchema (JSON Schema).
These are what the MCP server exposes to clients.

### 3. "system_prompt"
Not applicable for MCP servers — return a brief description of the server's purpose instead.

### 4. "skeleton_code"
Complete, working Python MCP server implementation using the `mcp` SDK with `@server.tool()` decorators
and `httpx` HTTP calls to the legacy API inside each handler.

IMPORTANT: The spec_markdown must be SELF-CONTAINED. Include actual code, actual API paths, actual JSON schemas.

Return ONLY valid JSON."""

    # Generate each part separately to avoid token limit truncation
    base_context = prompt.split("Generate a JSON response")[0]

    spec_md = await _call_claude(
        base_context +
        "Generate ONLY the spec_markdown field — a complete, self-contained Markdown specification "
        "for this MCP server following the structure outlined above. Return raw Markdown text, no JSON wrapping."
    )

    tools_json = await _call_claude_json(
        base_context +
        "Generate ONLY the MCP tool definitions as a JSON array. "
        "Each tool has: name, description, inputSchema (JSON Schema for parameters). "
        "These are what the MCP server exposes to clients. Return ONLY a valid JSON array."
    )

    system_prompt = await _call_claude(
        base_context +
        "Generate ONLY a brief description of this MCP server's purpose and capabilities. "
        "This is not a chat agent — just describe what the server does and what tools it exposes. Return raw text."
    )

    skeleton_code = await _call_claude(
        base_context +
        "Generate ONLY the Python MCP server implementation code. "
        "Use the `mcp` SDK with `@server.tool()` decorators. "
        "Inside each tool handler, make HTTP calls to the legacy API using `httpx`. "
        "Include all imports, error handling, type hints. "
        "Return raw Python code, no markdown fences."
    )

    return {
        "spec_markdown": spec_md,
        "tools_json": tools_json,
        "system_prompt": system_prompt,
        "skeleton_code": skeleton_code,
    }


async def _generate_orchestrator(agent_name: str, agents: list[dict],
                                 use_cases: list[dict], config: dict,
                                 connected_operators: list[dict],
                                 org_settings: dict | None = None) -> dict:
    """Generate an orchestrator agent that connects to MCP operator servers."""

    # Build operator context — each connected operator with its tools
    operators_ctx = []
    for op in connected_operators:
        op_entry = f"### {op['name']}\n"
        op_entry += f"- Description: {op.get('description', '')}\n"
        op_entry += f"- Server URI: {op.get('api_base_url', 'N/A')}\n"
        op_entry += f"- Auth: {op.get('api_auth_type', 'none')}\n"

        if op.get("api_spec"):
            if isinstance(op["api_spec"], list):
                # MCP tool definitions
                op_entry += "- MCP Tools:\n"
                for tool in op["api_spec"]:
                    tname = tool.get("name", "unnamed")
                    tdesc = tool.get("description", "")
                    params = tool.get("inputSchema", {}).get("properties", {})
                    param_names = ", ".join(params.keys()) if params else "none"
                    op_entry += f"  - {tname}({param_names}): {tdesc}\n"
            elif isinstance(op["api_spec"], dict):
                paths = op["api_spec"].get("paths", {})
                op_entry += f"- API Endpoints ({len(paths)} paths):\n"
                for path, methods in paths.items():
                    for method, details in methods.items():
                        if method in ("get", "post", "put", "patch", "delete"):
                            op_entry += f"  - {method.upper()} {path}: {details.get('summary', details.get('operationId', ''))}\n"

        operators_ctx.append(op_entry)

    # Build use case context (same format as operator path)
    use_cases_ctx = []
    for uc in use_cases:
        entry = {
            "name": uc["name"],
            "description": uc.get("description", ""),
            "trigger": uc.get("trigger_text", ""),
            "user_input": uc.get("user_input", ""),
            "expected_output": uc.get("expected_output", ""),
            "is_write": uc.get("is_write", False),
            "frequency": uc.get("frequency", ""),
        }
        if uc.get("sample_conversation"):
            entry["sample_conversation"] = uc["sample_conversation"]
        if uc.get("discovered_endpoints"):
            entry["discovered_endpoints"] = uc["discovered_endpoints"]
        if uc.get("discovered_behavior"):
            entry["behavior"] = uc["discovered_behavior"]
        use_cases_ctx.append(entry)

    # Build config context
    config_section = ""
    if config:
        parts = []
        if config.get("tech_stack"):
            parts.append(f"- **Language/Runtime:** {config['tech_stack']}")
        if config.get("framework"):
            parts.append(f"- **Framework:** {config['framework']}")
        if config.get("python_version"):
            parts.append(f"- **Python version:** {config['python_version']}")
        if config.get("agent_persona"):
            parts.append(f"- **Agent role/persona:** {config['agent_persona']}")
        if config.get("deployment"):
            parts.append(f"- **Deployment:** {config['deployment']}")
        if config.get("error_handling"):
            parts.append(f"- **Error handling strategy:** {config['error_handling']}")
        if config.get("auth_notes"):
            parts.append(f"- **Authentication notes:** {config['auth_notes']}")
        if config.get("additional_context"):
            parts.append(f"- **Additional context:** {config['additional_context']}")
        if parts:
            config_section = "## Configuration & Requirements\n" + "\n".join(parts)

    # Build org settings section
    org_section = ""
    if org_settings:
        parts = []
        if org_settings.get("tech_stack"): parts.append(f"- Language/Runtime: {org_settings['tech_stack']}")
        if org_settings.get("framework"): parts.append(f"- Framework: {org_settings['framework']}")
        if org_settings.get("mcp_sdk_version"): parts.append(f"- MCP SDK: {org_settings['mcp_sdk_version']}")
        if org_settings.get("deployment"): parts.append(f"- Deployment: {org_settings['deployment']}")
        if org_settings.get("error_handling"): parts.append(f"- Error Handling: {org_settings['error_handling']}")
        if org_settings.get("retry_strategy"): parts.append(f"- Retry Strategy: {org_settings['retry_strategy']}")
        if org_settings.get("logging"): parts.append(f"- Logging: {org_settings['logging']}")
        if org_settings.get("auth_pattern"): parts.append(f"- Authentication: {org_settings['auth_pattern']}")
        if org_settings.get("coding_standards"): parts.append(f"- Coding Standards: {org_settings['coding_standards']}")
        if org_settings.get("communication"): parts.append(f"- Communication: {org_settings['communication']}")
        if org_settings.get("org_rules"): parts.append(f"- Organization Rules: {org_settings['org_rules']}")
        if parts:
            org_section = "## Organization Standards\nAll agents in this organization follow these standards:\n" + "\n".join(parts)

    prompt = f"""You are a senior AI architect. Generate an orchestrator agent that connects to these
MCP operator servers and uses Claude to decide which tools to call. This document will be given to
Claude Code (an AI coding assistant) to implement the orchestrator from scratch.

## Orchestrator Name: {agent_name}

{config_section}
{org_section}

## Connected MCP Operator Servers
{chr(10).join(operators_ctx) if operators_ctx else "No connected operators defined yet."}

## Orchestration Use Cases
```json
{json.dumps(use_cases_ctx, indent=2, default=str)}
```

---

Generate a JSON response with these 4 keys:

### 1. "spec_markdown"
A COMPLETE orchestrator agent implementation specification in Markdown.

Structure it EXACTLY as follows:

```
# {{Agent Name}} — Orchestrator Agent Implementation Specification

## Overview
Purpose: an orchestrator agent that connects to multiple MCP operator servers
and uses Claude (tool_use) to decide which tools to call based on user requests.

## Technology Stack
Python, `anthropic` SDK, `mcp` SDK for MCP client connections, etc. Include specific versions.

## Connected Operators
For EACH MCP operator server: name, server URI, auth, available MCP tools with parameters.

## Agent Role & Persona
How the orchestrator should behave, tone, decision-making approach.

## Decision Logic
For each use case: what triggers it, which operator(s) and tool(s) to call, in what order,
how to combine results from multiple operators.

## System Prompt
The complete system prompt for the Claude orchestration layer.

## Tool Definitions
Claude tool definitions that map to the MCP tools from all connected operators.

## Implementation

### File Structure
Exactly which files to create.

### Dependencies
requirements.txt: must include `anthropic`, `mcp`, `httpx`, etc.

### Main Orchestrator Code
Complete Python implementation with:
- MCP client sessions to each operator server
- Claude tool_use orchestration loop
- Tool dispatch (route Claude's tool calls to the right MCP operator)
- Error handling, type hints
Use ```python code blocks.

### Configuration
Environment variables: ANTHROPIC_API_KEY, operator server URIs, etc.

## Safety Rules
What the orchestrator must NEVER do. What requires human approval.

## Escalation Rules
When to hand off to a human. Specific conditions.

## Testing
How to verify. Sample inputs and expected orchestration flows.
Include at least 3 test scenarios.
```

### 2. "tools_json"
Claude tool definitions as a JSON array — these are the tools Claude sees in the orchestration loop.
They should map to the MCP tools available across all connected operators.

### 3. "system_prompt"
The complete system prompt for the Claude orchestration layer.

### 4. "skeleton_code"
Complete, working Python orchestrator implementation that:
- Creates MCP client sessions to each operator server
- Uses Claude tool_use for decision-making
- Dispatches tool calls to the appropriate MCP operator via `session.call_tool()`
- Handles multi-step orchestration flows

IMPORTANT: The spec_markdown must be SELF-CONTAINED. Include actual code, actual server URIs, actual tool schemas.

Return ONLY valid JSON."""

    # Generate each part separately to avoid token limit truncation
    base_context = prompt.split("Generate a JSON response")[0]

    spec_md = await _call_claude(
        base_context +
        "Generate ONLY the spec_markdown field — a complete, self-contained Markdown specification "
        "for this orchestrator agent following the structure outlined above. Return raw Markdown text, no JSON wrapping."
    )

    tools_json = await _call_claude_json(
        base_context +
        "Generate ONLY the Claude tool definitions as a JSON array. "
        "These are the tools Claude sees in the orchestration loop, mapping to MCP tools "
        "from all connected operators. Return ONLY a valid JSON array."
    )

    system_prompt = await _call_claude(
        base_context +
        "Generate ONLY the system prompt text for this orchestrator agent. "
        "Include role, connected operators, available tools, decision-making guidelines, "
        "safety guardrails. Return raw text."
    )

    skeleton_code = await _call_claude(
        base_context +
        "Generate ONLY the Python orchestrator implementation code. "
        "Use the `mcp` Python SDK to create MCP client sessions to each operator server. "
        "Use the `anthropic` SDK with tool_use for orchestration. "
        "Show the full orchestration loop: user input -> Claude decides tools -> "
        "dispatch to MCP operators via session.call_tool() -> collect results -> Claude responds. "
        "Include all imports, error handling, type hints. "
        "Return raw Python code, no markdown fences."
    )

    return {
        "spec_markdown": spec_md,
        "tools_json": tools_json,
        "system_prompt": system_prompt,
        "skeleton_code": skeleton_code,
    }


def _extract_text(response_text: str) -> str:
    """Strip markdown code fences if present."""
    text = response_text.strip()
    if text.startswith("```"):
        # Remove first line (```lang) and last line (```)
        lines = text.split("\n")
        if lines[-1].strip() == "```":
            lines = lines[1:-1]
        else:
            lines = lines[1:]
        text = "\n".join(lines)
    return text


async def _call_claude(prompt: str) -> str:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_text(response.content[0].text)


async def _call_claude_json(prompt: str) -> list:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = _extract_text(response.content[0].text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON array in the text
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            return json.loads(text[start:end + 1])
        return []
