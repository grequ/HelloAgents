"""Self-discovery engine — Claude analyzes an API spec + use case
and maps the use case to specific API endpoints."""

import json
import anthropic

client = anthropic.Anthropic()


async def discover(api_spec: dict, use_case: dict) -> dict:
    """Analyze an API spec and map a use case to endpoints.

    Returns:
        {
            "endpoints": [{ method, path, purpose, parameters, extracts }],
            "behavior": "description of how agent would chain the calls",
            "tool_definition": { name, description, input_schema },
            "suggested_response_template": "..."
        }
    """
    # Trim spec to paths only (avoid token bloat)
    trimmed_spec = {
        "servers": api_spec.get("servers", []),
        "paths": api_spec.get("paths", {}),
    }
    spec_str = json.dumps(trimmed_spec, indent=2)
    if len(spec_str) > 40000:
        spec_str = spec_str[:40000] + "\n... (truncated)"

    prompt = f"""You are an API integration architect. Given an OpenAPI spec and a use case,
determine exactly which API endpoints the agent should call, in what order, and how to
compose the result.

## API Spec
```json
{spec_str}
```

## Use Case
- **Name:** {use_case.get('name', '')}
- **Trigger:** {use_case.get('trigger_text', '')}
- **User provides:** {use_case.get('user_input', '')}
- **Expected response:** {use_case.get('expected_output', '')}
- **Write operation:** {use_case.get('is_write', False)}

## Instructions
Return a JSON object with:

1. "endpoints" — array of endpoints to call, in order:
   - method: HTTP method
   - path: API path (with path parameters as placeholders)
   - purpose: why this call is needed
   - parameters: where each parameter comes from ("from user input", "from step N response")
   - extracts: what fields to extract from the response

2. "behavior" — plain English description of the full flow

3. "tool_definition" — a Claude tool definition object:
   - name: snake_case tool name
   - description: when to use this tool
   - input_schema: JSON Schema for the tool input (what the LLM provides)

4. "suggested_response_template" — how the agent should format the answer, with {{placeholders}}

Return ONLY valid JSON, no markdown fences."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0]

    return json.loads(text)
