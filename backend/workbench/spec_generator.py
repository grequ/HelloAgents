"""Agent spec generator — uses workbench data (tested use cases, real responses)
to generate production-ready agent specifications."""

import json
import anthropic

client = anthropic.Anthropic()


async def generate(agent_name: str, agents: list[dict], use_cases: list[dict],
                   config: dict | None = None) -> dict:
    """Generate a complete agent spec from agents, use cases, and config.

    config may contain:
        tech_stack, framework, python_version, agent_role, deployment,
        interactions, error_handling, auth_notes, additional_context

    Returns dict with: spec_markdown, tools_json, system_prompt, skeleton_code
    """
    config = config or {}

    # Build context from agents
    agents_ctx = []
    api_specs_ctx = []
    for s in agents:
        spec_summary = ""
        endpoints_detail = ""
        if s.get("api_spec") and isinstance(s["api_spec"], dict):
            paths = s["api_spec"].get("paths", {})
            spec_summary = f" ({len(paths)} endpoints)"
            # Include actual endpoint details
            for path, methods in paths.items():
                for method, details in methods.items():
                    if method in ("get", "post", "put", "patch", "delete"):
                        endpoints_detail += f"\n  - {method.upper()} {path}: {details.get('summary', details.get('operationId', ''))}"
        agents_ctx.append(
            f"### {s['name']}\n"
            f"- Description: {s.get('description', '')}\n"
            f"- Type: {s.get('api_type', 'rest')}{spec_summary}\n"
            f"- Base URL: {s.get('api_base_url', 'N/A')}\n"
            f"- Auth: {s.get('api_auth_type', 'none')}\n"
            f"- Endpoints:{endpoints_detail or ' N/A'}"
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
            "priority": uc.get("priority", "medium"),
            "frequency": uc.get("frequency", ""),
        }
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
        if config.get("agent_role"):
            parts.append(f"- **Agent role/persona:** {config['agent_role']}")
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

    prompt = f"""You are a senior AI architect. Generate a COMPLETE, SELF-CONTAINED agent implementation
specification in Markdown. This document will be given to Claude Code (an AI coding assistant) to
implement the agent from scratch. It must contain EVERYTHING needed — no external references.

## Agent Name: {agent_name}

{config_section}

## Connected Agents
{chr(10).join(agents_ctx)}

## Use Cases (with discovery and test data)
```json
{json.dumps(use_cases_ctx, indent=2, default=str)}
```

---

Generate a JSON response with these 4 keys:

### 1. "spec_markdown"
A COMPLETE implementation specification in Markdown. This is the primary deliverable — it must be
detailed enough that another AI agent can implement the entire agent from this document alone.

Structure it EXACTLY as follows:

```
# {{Agent Name}} — Implementation Specification

## Overview
Purpose, domain, what this agent does. 1-2 paragraphs.

## Technology Stack
Language, framework, dependencies with versions. Be specific.

## Connected Agents
For EACH agent: name, base URL, auth method, key endpoints with HTTP method + path + description.

## Agent Role & Persona
How the agent should behave, tone, boundaries. This becomes the system prompt.

## Tools
For EACH tool the agent exposes:
- Name (snake_case)
- Description (when to use it)
- Parameters (name, type, required, description)
- Which API endpoints it calls internally
- What it returns
- Error cases

## Decision Logic
For each use case: what triggers it, which tool(s) to call, in what order, how to combine results.
Include concrete examples with sample inputs and expected outputs.

## System Prompt
The complete system prompt text — ready to copy-paste.

## Tool Definitions
Complete JSON array of Claude tool definitions — ready to paste into the Anthropic API `tools` parameter.
Use a ```json code block.

## Implementation

### File Structure
Exactly which files to create and what each contains.

### Dependencies
requirements.txt or package.json content.

### Main Agent Code
Complete Python (or specified language) implementation with:
- All imports
- Tool handler functions with real HTTP calls
- The orchestration loop (Claude tool_use pattern)
- Error handling
- Type hints
Use ```python code blocks.

### Configuration
Environment variables needed, .env template.

## Safety Rules
What the agent must NEVER do. What requires human approval.

## Escalation Rules
When to hand off to a human agent. Specific conditions.

## Testing
How to verify the agent works. Sample test inputs and expected outputs.
Include at least 3 test scenarios.
```

### 2. "tools_json"
Complete Claude tool definitions as a JSON array, ready for the Anthropic API.

### 3. "system_prompt"
The complete system prompt text.

### 4. "skeleton_code"
Complete, working Python implementation.

IMPORTANT: The spec_markdown must be SELF-CONTAINED. Anyone reading it should be able to implement
the agent without needing any other document. Include actual code, actual API paths, actual JSON schemas.

Return ONLY valid JSON."""

    # Generate each part separately to avoid token limit truncation
    base_context = prompt.split("Generate a JSON response")[0]

    spec_md = await _call_claude(
        base_context +
        "Generate ONLY the spec_markdown field — a complete, self-contained Markdown implementation specification "
        "following the structure outlined above. Return raw Markdown text, no JSON wrapping."
    )

    tools_json = await _call_claude_json(
        base_context +
        "Generate ONLY the Claude tool definitions as a JSON array. "
        "Ready for the Anthropic API `tools` parameter. Return ONLY a valid JSON array."
    )

    system_prompt = await _call_claude(
        base_context +
        "Generate ONLY the system prompt text for this agent. "
        "Include role, boundaries, available tools, usage guidelines, safety guardrails. Return raw text."
    )

    skeleton_code = await _call_claude(
        base_context +
        "Generate ONLY the Python implementation code for this agent. "
        "Include all imports, tool handlers with real HTTP endpoints, orchestration loop, error handling. "
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
