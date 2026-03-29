"""Orchestrator routing tester — simulates routing decisions to validate
that an orchestrator would correctly delegate to the right agents."""

import json
import anthropic

client = anthropic.Anthropic()


async def test_routing(
    use_case: dict,
    agent: dict,
    connected_agents: list[dict],
    all_tools: list[dict],
) -> dict:
    """Simulate an orchestrator's routing decision for a given use case.

    Returns:
        {
            "routing_decision": [{"agent": str, "reason": str}],
            "tool_calls": [{"agent": str, "tool": str, "purpose": str, "order": int}],
            "expected_flow": str,
            "confidence": str,  # "high" | "medium" | "low"
            "issues": [str],
            "success": bool,
        }
    """
    # Build connected agents context
    agents_ctx = []
    for ag in connected_agents:
        role = ag.get("agent_role", "operator")
        entry = f"### {ag['name']} ({role})\n"
        entry += f"Description: {ag.get('description', '')}\n"

        agent_tools = [t for t in all_tools if t.get("agent_id") == ag["id"]]
        if agent_tools:
            entry += "Available tools:\n"
            for t in agent_tools:
                entry += f"  - {t['name']}: {t.get('description', '')}\n"
        elif ag.get("api_spec"):
            spec = ag["api_spec"]
            if isinstance(spec, list):
                entry += "MCP tools:\n"
                for t in spec[:15]:
                    entry += f"  - {t.get('name', '')}: {t.get('description', '')[:80]}\n"
            elif isinstance(spec, dict) and "paths" in spec:
                entry += "API endpoints:\n"
                for path, methods in list(spec["paths"].items())[:15]:
                    for method in methods:
                        if method in ("get", "post", "put", "patch", "delete"):
                            entry += f"  - {method.upper()} {path}\n"
        agents_ctx.append(entry)

    # Build persona context
    persona = ""
    if agent.get("agent_config"):
        config = agent["agent_config"]
        if isinstance(config, dict):
            persona = config.get("agent_persona", "")
            context = config.get("additional_context", "")
            if context:
                persona += f"\n\nAdditional context:\n{context}"

    prompt = f"""You are simulating an AI orchestrator agent to validate its routing logic.

## Orchestrator
**Name:** {agent.get('name', '')}
**Persona:** {persona or 'Not defined'}

## Connected Agents
{chr(10).join(agents_ctx) if agents_ctx else "No connected agents."}

## Use Case to Test
**Name:** {use_case.get('name', '')}
**Trigger:** {use_case.get('trigger_text', '')}
**User provides:** {use_case.get('user_input', '')}
**Expected output:** {use_case.get('expected_output', '')}

## Your Task

Simulate how this orchestrator would handle the use case trigger. Think through:
1. Which connected agent(s) should be called?
2. Which specific tool(s) on each agent?
3. In what order?
4. How would results be combined?
5. Are there any issues (missing tools, ambiguous routing, no agent can handle this)?

Return a JSON object with:
- "routing_decision": array of {{"agent": "agent name", "reason": "why this agent"}}
- "tool_calls": array of {{"agent": "agent name", "tool": "tool name", "purpose": "what for", "order": 1}}
- "expected_flow": plain text narrative of the full orchestration flow (3-5 sentences)
- "confidence": "high" if routing is clear, "medium" if reasonable but has alternatives, "low" if unclear/problematic
- "issues": array of strings describing any problems (empty if none)

Return ONLY valid JSON, no markdown fences."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    if not response.content:
        raise ValueError("Empty response from routing test")

    text = response.content[0].text.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0]

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        return {
            "routing_decision": [],
            "tool_calls": [],
            "expected_flow": "Failed to parse routing simulation",
            "confidence": "low",
            "issues": ["AI response was not valid JSON"],
            "success": False,
        }

    # Determine success based on confidence and issues
    confidence = result.get("confidence", "low")
    issues = result.get("issues", [])
    result["success"] = confidence in ("high", "medium") and len(issues) == 0

    return result
