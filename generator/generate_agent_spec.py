"""Agent Spec Generator

Takes a use-cases YAML file + OpenAPI/Postman specs and generates a complete
agent specification using Claude.

Usage:
    python generate_agent_spec.py examples/logistics_usecases.yaml -o output/

Output:
    output/
    ├── logistics_agent_spec.md     # Human-readable spec (for review)
    ├── logistics_agent_tools.json  # Claude tool definitions (ready to paste)
    ├── logistics_agent_prompt.txt  # System prompt for the agent
    └── logistics_agent.py          # Skeleton Python implementation
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import yaml
import anthropic

client = anthropic.Anthropic()


def load_use_cases(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def load_api_specs(systems: list[dict], base_dir: str) -> dict[str, str]:
    """Load API specs referenced in the use cases file."""
    specs = {}
    for system in systems:
        spec_path = system.get("api_spec")
        if not spec_path:
            continue
        full_path = Path(base_dir) / spec_path
        if full_path.exists():
            with open(full_path) as f:
                content = f.read()
            # Truncate very large specs to avoid token limits
            if len(content) > 50000:
                content = content[:50000] + "\n... (truncated)"
            specs[system["name"]] = content
        else:
            print(f"  Warning: API spec not found: {full_path}")
    return specs


def generate_spec(use_cases: dict, api_specs: dict) -> dict:
    """Call Claude to generate the agent specification."""

    use_cases_yaml = yaml.dump(use_cases, default_flow_style=False, sort_keys=False)

    api_context = ""
    for system_name, spec_content in api_specs.items():
        api_context += f"\n\n### API Spec: {system_name}\n```json\n{spec_content}\n```"

    prompt = f"""You are an AI architect. Given the following use cases and API specifications,
generate a complete agent specification.

## Use Cases (YAML)
```yaml
{use_cases_yaml}
```

{f"## API Specifications{api_context}" if api_context else ""}

---

Generate the following 4 outputs as a single JSON response with these keys:

### 1. "spec_md" — Agent Specification (Markdown)
A human-readable spec document containing:
- Agent name, domain, and purpose
- List of tools with descriptions
- Decision logic: when to call which tool(s) for each use case
- Input/output contracts
- Safety rules (what the agent must NOT do)
- Escalation rules (when to hand off to a human)

### 2. "tools_json" — Claude Tool Definitions (JSON array)
Ready-to-use tool definitions for the Anthropic API `tools` parameter.
- One tool per distinct API operation the agent needs
- Group related API calls into a single tool when they're always called together
- Use clear, descriptive names (e.g., "track_shipment" not "call_api_1")
- Input schemas should match what the LLM will naturally provide
- Include descriptions that help the LLM decide WHEN to use each tool

### 3. "system_prompt" — System Prompt
The system prompt for this agent, including:
- Role and boundaries
- Available tools and when to use each
- Rules for combining tool results
- Safety guardrails
- Tone and response format

### 4. "agent_py" — Python Implementation Skeleton
A working Python file with:
- Tool handler functions (with HTTP call placeholders showing the real endpoint)
- The orchestration loop (same pattern as Claude tool_use)
- Proper async/await
- Type hints
- Comments showing where to plug in real API clients

IMPORTANT: The tools should map use cases to API endpoints intelligently:
- If a use case requires multiple API calls, the TOOL should make all of them internally
  (the LLM calls one tool, the tool calls multiple endpoints)
- If multiple use cases share the same API call, they can share a tool
- Read-only tools and write tools should be clearly separated
- Write tools should include confirmation fields where appropriate

Return valid JSON with keys: spec_md, tools_json, system_prompt, agent_py"""

    print("  Calling Claude to generate agent spec...")
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text

    # Extract JSON from the response (handle markdown code blocks)
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0]

    return json.loads(text)


def write_outputs(result: dict, agent_name: str, output_dir: str):
    """Write generated files to the output directory."""
    os.makedirs(output_dir, exist_ok=True)

    slug = agent_name.lower().replace(" ", "_")

    # Spec document
    spec_path = Path(output_dir) / f"{slug}_spec.md"
    with open(spec_path, "w", encoding="utf-8") as f:
        f.write(result["spec_md"])
    print(f"  Written: {spec_path}")

    # Tool definitions
    tools_path = Path(output_dir) / f"{slug}_tools.json"
    with open(tools_path, "w", encoding="utf-8") as f:
        json.dump(result["tools_json"], f, indent=2)
    print(f"  Written: {tools_path}")

    # System prompt
    prompt_path = Path(output_dir) / f"{slug}_prompt.txt"
    with open(prompt_path, "w", encoding="utf-8") as f:
        f.write(result["system_prompt"])
    print(f"  Written: {prompt_path}")

    # Python skeleton
    py_path = Path(output_dir) / f"{slug}.py"
    with open(py_path, "w", encoding="utf-8") as f:
        f.write(result["agent_py"])
    print(f"  Written: {py_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate an agent spec from use cases + API specs"
    )
    parser.add_argument("use_cases", help="Path to use cases YAML file")
    parser.add_argument(
        "-o", "--output", default="output", help="Output directory (default: output/)"
    )
    args = parser.parse_args()

    print(f"Loading use cases from: {args.use_cases}")
    use_cases = load_use_cases(args.use_cases)

    agent_name = use_cases.get("agent_name", "Agent")
    print(f"Agent: {agent_name}")
    print(f"Use cases: {len(use_cases.get('use_cases', []))}")

    base_dir = str(Path(args.use_cases).parent)
    api_specs = load_api_specs(use_cases.get("systems", []), base_dir)
    print(f"API specs loaded: {len(api_specs)}")

    result = generate_spec(use_cases, api_specs)

    write_outputs(result, agent_name, args.output)
    print(f"\nDone! Review the generated files in: {args.output}/")


if __name__ == "__main__":
    main()
