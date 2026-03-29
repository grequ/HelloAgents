"""Project exporter — generates a complete, runnable project ZIP from a spec."""

import io
import json
import re
import zipfile


def _slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def _extract_imports(code: str) -> list[str]:
    """Extract top-level package names from import statements."""
    packages = set()
    for line in code.splitlines():
        line = line.strip()
        if line.startswith("import "):
            pkg = line.split()[1].split(".")[0].split(",")[0]
            packages.add(pkg)
        elif line.startswith("from ") and "import" in line:
            pkg = line.split()[1].split(".")[0]
            packages.add(pkg)
    return sorted(packages)


# Map of Python import names → pip package names
_PIP_MAP = {
    "anthropic": "anthropic>=0.40",
    "mcp": "mcp>=1.0",
    "httpx": "httpx>=0.27",
    "dotenv": "python-dotenv>=1.0",
    "fastapi": "fastapi>=0.115",
    "uvicorn": "uvicorn>=0.32",
    "pydantic": "pydantic>=2.0",
}

# Standard library modules to skip
_STDLIB = {
    "os", "sys", "json", "re", "typing", "pathlib", "datetime", "asyncio",
    "collections", "functools", "dataclasses", "enum", "abc", "io",
    "logging", "traceback", "uuid", "hashlib", "base64", "time",
}


def _build_requirements(code: str) -> str:
    imports = _extract_imports(code)
    lines = []
    for imp in imports:
        if imp in _STDLIB:
            continue
        pip_name = _PIP_MAP.get(imp, imp)
        lines.append(pip_name)
    # Always include python-dotenv
    if "python-dotenv>=1.0" not in lines:
        lines.append("python-dotenv>=1.0")
    return "\n".join(sorted(set(lines))) + "\n"


def _extract_env_vars(code: str) -> list[str]:
    """Find os.getenv/os.environ references in code."""
    pattern = r'os\.(?:getenv|environ\.get|environ\[)["\']([A-Z_]+)'
    return sorted(set(re.findall(pattern, code)))


def _build_env_example(env_vars: list[str], is_orchestrator: bool) -> str:
    lines = ["# Environment variables for this agent", ""]
    for var in env_vars:
        if "KEY" in var or "SECRET" in var or "TOKEN" in var:
            lines.append(f"{var}=your-key-here")
        elif "URL" in var or "URI" in var:
            lines.append(f"{var}=http://localhost:8100")
        elif "PORT" in var:
            lines.append(f"{var}=8200" if is_orchestrator else f"{var}=8100")
        else:
            lines.append(f"{var}=")
    if not env_vars:
        if is_orchestrator:
            lines.append("ANTHROPIC_API_KEY=your-key-here")
        else:
            lines.append("LEGACY_API_BASE_URL=http://localhost:3000")
            lines.append("LEGACY_API_KEY=your-key-here")
    return "\n".join(lines) + "\n"


def _build_dockerfile(main_file: str) -> str:
    return f"""FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "{main_file}"]
"""


def _build_docker_compose(slug: str, main_file: str, port: int) -> str:
    return f"""services:
  {slug}:
    build: .
    ports:
      - "{port}:{port}"
    env_file:
      - .env
    restart: unless-stopped
"""


def _build_readme(
    name: str, description: str, is_orchestrator: bool,
    tools: list, use_cases: list[dict],
    connected_operators: list[str] | None = None,
) -> str:
    lines = [f"# {name}", ""]
    if description:
        lines += [description, ""]

    if is_orchestrator:
        lines += ["## Type", "Orchestrator — coordinates across connected operators using Claude.", ""]
        if connected_operators:
            lines += ["## Connected Operators"]
            for op in connected_operators:
                lines.append(f"- {op}")
            lines.append("")
    else:
        lines += ["## Type", "Operator — MCP server wrapping a legacy API.", ""]

    if tools:
        lines += ["## Tools"]
        for t in tools:
            tname = t.get("name", "unnamed") if isinstance(t, dict) else str(t)
            tdesc = t.get("description", "") if isinstance(t, dict) else ""
            lines.append(f"- **{tname}**{' — ' + tdesc if tdesc else ''}")
        lines.append("")

    if use_cases:
        lines += ["## Use Cases"]
        for uc in use_cases:
            lines.append(f"- **{uc.get('name', '')}** — {uc.get('description', '')}")
        lines.append("")

    lines += [
        "## Quick Start",
        "",
        "```bash",
        "cp .env.example .env",
        "# Fill in your API keys",
        "docker compose up",
        "```",
        "",
        "## Run Without Docker",
        "",
        "```bash",
        "pip install -r requirements.txt",
        "cp .env.example .env",
        "# Fill in your API keys",
    ]
    if is_orchestrator:
        lines.append("python orchestrator.py")
    else:
        lines.append("python server.py")
    lines += ["```", ""]

    return "\n".join(lines)


def _build_test_file(
    is_orchestrator: bool, tools: list, use_cases: list[dict],
) -> str:
    lines = [
        '"""Smoke tests — verify the agent starts and basic tool calls work."""',
        "",
        "import json",
        "import subprocess",
        "import time",
        "",
        "",
    ]
    if is_orchestrator:
        lines += [
            "# Orchestrator tests require connected operators to be running.",
            "# These are sample conversation flows to verify routing logic.",
            "",
        ]
        for i, uc in enumerate(use_cases[:5]):
            lines += [
                f"def test_{i + 1}_{_slugify(uc.get('name', 'case')).replace('-', '_')}():",
                f'    """',
                f'    Use case: {uc.get("name", "")}',
                f'    Trigger: {uc.get("trigger_text", "")}',
                f'    Input: {uc.get("user_input", "")}',
                f'    Expected: {uc.get("expected_output", "")}',
                f'    """',
                f"    # TODO: Send test message and verify orchestrator routes correctly",
                f"    pass",
                "",
                "",
            ]
    else:
        lines += [
            "# Operator tests call each MCP tool with sample input.",
            "",
        ]
        for i, t in enumerate(tools[:10]):
            tname = t.get("name", f"tool_{i}") if isinstance(t, dict) else str(t)
            lines += [
                f"def test_{tname.replace('-', '_')}():",
                f'    """Test the {tname} tool with sample input."""',
                f"    # TODO: Connect to MCP server and call tool",
                f"    pass",
                "",
                "",
            ]

    if not use_cases and not tools:
        lines += [
            "def test_placeholder():",
            '    """Placeholder — add tests for your agent tools."""',
            "    pass",
            "",
        ]

    return "\n".join(lines)


def export_project(
    spec: dict,
    agents: list[dict],
    use_cases: list[dict],
    connected_operators: list[str] | None = None,
) -> bytes:
    """Generate a ZIP file containing a complete, runnable agent project."""
    name = spec.get("name", "agent")
    slug = _slugify(name)
    code = spec.get("skeleton_code", "")
    tools = spec.get("tools_json", []) or []
    system_prompt = spec.get("system_prompt", "")
    spec_md = spec.get("spec_markdown", "")

    # Determine agent type
    is_orchestrator = any(
        a.get("agent_role") == "orchestrator" for a in agents
    )
    main_file = "orchestrator.py" if is_orchestrator else "server.py"
    port = 8200 if is_orchestrator else 8100

    # Extract env vars from generated code
    env_vars = _extract_env_vars(code)

    # Build all project files
    files = {
        main_file: code,
        "requirements.txt": _build_requirements(code),
        "Dockerfile": _build_dockerfile(main_file),
        "docker-compose.yml": _build_docker_compose(slug, main_file, port),
        ".env.example": _build_env_example(env_vars, is_orchestrator),
        "README.md": _build_readme(
            name,
            agents[0].get("description", "") if agents else "",
            is_orchestrator,
            tools,
            use_cases,
            connected_operators,
        ),
        f"tests/test_{'orchestration' if is_orchestrator else 'tools'}.py": _build_test_file(
            is_orchestrator, tools, use_cases,
        ),
    }

    # Include spec markdown as reference
    if spec_md:
        files["docs/spec.md"] = spec_md

    # Include tools JSON for reference
    if tools:
        files["docs/tools.json"] = json.dumps(tools, indent=2)

    # Include system prompt
    if system_prompt:
        files["docs/system_prompt.txt"] = system_prompt

    # Create ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in sorted(files.items()):
            zf.writestr(f"{slug}/{path}", content)
    buf.seek(0)
    return buf.getvalue()
