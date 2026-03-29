"""FastAPI routes for the Agent Migration Workbench."""

import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from workbench.models import (
    AgentCreate, AgentUpdate, AgentOut,
    AgentToolOut,
    UseCaseCreate, UseCaseUpdate, UseCaseOut,
    DiscoverRequest, TestRequest,
    GenerateSpecRequest, AgentSpecOut,
    OrgSettingsOut,
)
from workbench import wb_db
from workbench.crypto import encrypt_api_key, decrypt_api_key
from workbench.discovery import discover
from workbench.tester import run_test
from workbench.spec_generator import generate

router = APIRouter(prefix="/workbench", tags=["workbench"])


# ---- Dashboard ----

@router.get("/dashboard")
async def dashboard():
    stats = await wb_db.get_dashboard_stats()
    agents = await wb_db.list_agents()
    return {"stats": stats, "agents": agents}


@router.post("/seed")
async def seed():
    from workbench.seed import seed_demo_data
    return await seed_demo_data()


# ---- Organization Settings ----

@router.get("/settings", response_model=OrgSettingsOut)
async def get_settings():
    s = await wb_db.get_org_settings()
    if not s:
        raise HTTPException(404, "Settings not found")
    return s

@router.put("/settings", response_model=OrgSettingsOut)
async def update_settings(body: dict):
    return await wb_db.update_org_settings(body)


# ---- Agents CRUD ----

@router.get("/agents", response_model=list[AgentOut])
async def list_agents(role: str | None = None):
    return await wb_db.list_agents(role=role)


@router.get("/agents/operators", response_model=list[AgentOut])
async def list_operators():
    return await wb_db.list_agents(role="operator")


@router.post("/agents", response_model=AgentOut)
async def create_agent(body: AgentCreate):
    return await wb_db.create_agent(body.model_dump())


@router.get("/agents/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: str):
    s = await wb_db.get_agent(agent_id)
    if not s:
        raise HTTPException(404, "Agent not found")
    return s


@router.put("/agents/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: str, body: AgentUpdate):
    s = await wb_db.update_agent(agent_id, body.model_dump(exclude_none=True))
    if not s:
        raise HTTPException(404, "Agent not found")
    return s


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    await wb_db.delete_agent(agent_id)
    return {"ok": True}


@router.get("/interactions")
async def get_all_interactions():
    return await wb_db.get_all_interactions()


@router.get("/agents/{agent_id}/interactions")
async def get_interactions(agent_id: str):
    return await wb_db.get_interactions(agent_id)


@router.put("/agents/{agent_id}/interactions")
async def save_interactions(agent_id: str, body: dict):
    asks = body.get("asks", [])
    provides_to = body.get("provides_to", [])
    await wb_db.save_interactions(agent_id, asks, provides_to)
    return await wb_db.get_interactions(agent_id)


@router.post("/agents/{agent_id}/api-key")
async def set_api_key(agent_id: str, body: dict):
    key = body.get("api_key", "")
    if not key:
        raise HTTPException(400, "api_key is required")
    encrypted = encrypt_api_key(key)
    await wb_db.set_agent_api_key(agent_id, encrypted)
    return {"ok": True}


@router.post("/agents/{agent_id}/upload-spec")
async def upload_spec(agent_id: str, file: UploadFile = File(...)):
    content = await file.read()
    try:
        spec = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")
    await wb_db.set_agent_api_spec(agent_id, spec)
    return {"ok": True, "endpoint_count": len(spec.get("paths", {}))}


@router.post("/agents/{agent_id}/upload-spec-json")
async def upload_spec_json(agent_id: str, body: dict):
    """Accept API spec as JSON body with optional source URL."""
    spec = body.get("spec", body)  # Support {spec, source} or raw spec
    source = body.get("source", None)
    await wb_db.set_agent_api_spec(agent_id, spec, source=source)
    paths = spec.get("paths", {}) if isinstance(spec, dict) else spec
    count = len(paths) if isinstance(paths, (dict, list)) else 0
    return {"ok": True, "endpoint_count": count}


@router.post("/agents/{agent_id}/test-connection")
async def test_connection(agent_id: str):
    s = await wb_db.get_agent(agent_id)
    if not s:
        raise HTTPException(404, "Agent not found")
    if not s.get("api_base_url"):
        raise HTTPException(400, "No API base URL configured")
    key_enc = await wb_db.get_agent_api_key_enc(agent_id)
    api_key = decrypt_api_key(key_enc) if key_enc else ""
    import httpx

    # Try multiple auth methods (same as test-url)
    auth_attempts = [{}]
    if api_key:
        auth_attempts = [
            {"Authorization": f"Bearer {api_key}"},
            {"apikey": api_key},
            {"X-Api-Key": api_key},
            {"Api-Key": api_key},
        ]

    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            for headers in auth_attempts:
                resp = await http.get(s["api_base_url"], headers=headers)
                if resp.status_code < 400:
                    return {"ok": True, "status_code": resp.status_code}
            return {"ok": False, "status_code": resp.status_code, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/test-url")
async def test_url(body: dict):
    """Test a URL + API key. Tries multiple auth methods to find one that works."""
    url = body.get("url", "")
    api_key = body.get("api_key", "")
    if not url:
        raise HTTPException(400, "url is required")
    import httpx

    # Auth methods to try (in order)
    auth_attempts = [{}]  # No auth first
    if api_key:
        auth_attempts = [
            {"Authorization": f"Bearer {api_key}"},
            {"apikey": api_key},
            {"X-Api-Key": api_key},
            {"Api-Key": api_key},
            {"Authorization": f"Api-Key {api_key}"},
        ]

    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            for headers in auth_attempts:
                resp = await http.get(url, headers=headers)
                if resp.status_code < 400:
                    auth_method = next(iter(headers.keys()), "none") if headers else "none"
                    return {"ok": True, "status_code": resp.status_code, "auth_method": auth_method}
            # None worked — return the last attempt's status
            return {"ok": False, "status_code": resp.status_code, "error": f"HTTP {resp.status_code} — tried {len(auth_attempts)} auth methods"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/fetch-url")
async def fetch_url(body: dict):
    """Fetch a URL server-side and return its JSON content."""
    url = body.get("url", "")
    if not url:
        raise HTTPException(400, "url is required")
    import httpx
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as http:
            resp = await http.get(url)
        if resp.status_code != 200:
            raise HTTPException(400, f"HTTP {resp.status_code} from {url}")
        return resp.json()
    except json.JSONDecodeError:
        raise HTTPException(400, "URL did not return valid JSON")
    except httpx.HTTPError as e:
        raise HTTPException(400, f"Failed to fetch URL: {e}")


@router.post("/generate-test-input")
async def generate_test_input(body: dict):
    """AI generates realistic test input for a use case based on endpoints and context."""
    import anthropic, os, re

    endpoints = body.get("endpoints", [])
    user_input = body.get("user_input", "")
    behavior = body.get("behavior", "")
    use_case_name = body.get("use_case_name", "")
    agent_name = body.get("agent_name", "")
    base_url = body.get("base_url", "")

    ep_summary = "\n".join(
        f"  {ep.get('method','GET')} {ep.get('path','')} — params: {json.dumps(ep.get('parameters',{}))}"
        for ep in endpoints
    )

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    prompt = (
        "Generate a realistic test input JSON object for this API use case.\n\n"
        f"Agent: {agent_name}\n"
        f"Base URL: {base_url}\n"
        f"Use case: {use_case_name}\n"
        f"User provides: {user_input}\n"
        f"Agent behavior: {behavior}\n"
        f"Endpoints:\n{ep_summary}\n\n"
        "Rules:\n"
        "- Return a single JSON object with realistic parameter values\n"
        "- Use real-world example values (real phone numbers, real names, valid IDs)\n"
        "- Match the parameter types from the endpoints (strings, integers, etc.)\n"
        "- Include all required parameters\n"
        "- Values should make sense for the API (e.g. country_code should be a real ISO country code like 'US', not 'sample')\n"
        "- For phone numbers use a real format like '+14158586273'\n"
        "- For IDs use small integers like 1, 5, 42\n"
        "- For search queries use realistic terms\n\n"
        "Return ONLY the JSON object, no explanation, no markdown."
    )

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return json.loads(text[start:end + 1])
        return {"error": "Failed to generate test input"}


@router.post("/discover-endpoints")
async def discover_endpoints(body: dict):
    """AI-powered endpoint discovery from an API spec."""
    spec = body.get("spec")
    agent_name = body.get("agent_name", "")
    if not spec:
        raise HTTPException(400, "spec is required")

    import anthropic
    import os
    import re

    # Build a compact spec summary
    lines = []
    if isinstance(spec, dict) and "paths" in spec:
        for path, methods in spec["paths"].items():
            for method, details in methods.items():
                if method in ("get", "post", "put", "patch", "delete"):
                    summary = details.get("summary", details.get("description", details.get("operationId", "")))
                    params = details.get("parameters", [])
                    param_names = ", ".join(p.get("name", "") for p in params[:5]) if params else ""
                    lines.append(f"{method.upper()} {path} | summary: {(summary or '')[:80]} | params: {param_names}")
    elif isinstance(spec, list):
        # MCP tools
        for tool in spec:
            lines.append(f"TOOL {tool.get('name', '')} | {tool.get('description', '')[:80]}")

    if not lines:
        raise HTTPException(400, "No endpoints found in spec")

    spec_text = "\n".join(lines)

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    prompt = (
        f"Analyze these API endpoints for the '{agent_name}' agent and return enriched descriptions.\n\n"
        f"Raw endpoints:\n{spec_text}\n\n"
        "Return a JSON array. For each endpoint:\n"
        '{"method": "GET", "path": "/products", "summary": "one-line description of what this does and when to use it"}\n\n'
        "Rules:\n"
        "- summary should be clear, human-readable, 1 sentence\n"
        "- Group/order logically (CRUD order per resource)\n"
        "- Remove internal/admin endpoints that agents shouldn't use\n\n"
        "Return ONLY a JSON array, no markdown."
    )

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)

    try:
        endpoints = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            endpoints = json.loads(text[start:end + 1])
        else:
            raise HTTPException(500, "Failed to parse AI response")

    return endpoints


# ---- Agent Tools ----

@router.get("/agents/{agent_id}/tools", response_model=list[AgentToolOut])
async def list_tools(agent_id: str):
    return await wb_db.list_tools(agent_id)

@router.put("/agents/tools/{tool_id}", response_model=AgentToolOut)
async def update_tool(tool_id: str, body: dict):
    t = await wb_db.update_tool(tool_id, body)
    if not t:
        raise HTTPException(404, "Tool not found")
    return t

@router.delete("/agents/tools/{tool_id}")
async def delete_tool(tool_id: str):
    await wb_db.delete_tool(tool_id)
    return {"ok": True}

@router.post("/agents/{agent_id}/discover-tools")
async def discover_tools(agent_id: str):
    """AI discovers MCP tools from completed use cases."""
    agent = await wb_db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    # Get completed use cases
    all_ucs = await wb_db.list_use_cases(agent_id)
    completed = [uc for uc in all_ucs if uc.get("status") == "completed"]
    if not completed:
        raise HTTPException(400, "No completed use cases. Mark use cases as completed first.")

    import anthropic, os, re
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    # Build context
    uc_context = []
    for uc in completed:
        entry = {
            "id": uc["id"],
            "name": uc["name"],
            "description": uc.get("description", ""),
            "trigger": uc.get("trigger_text", ""),
            "user_input": uc.get("user_input", ""),
            "expected_output": uc.get("expected_output", ""),
            "discovered_endpoints": uc.get("discovered_endpoints", []),
            "discovered_behavior": uc.get("discovered_behavior", ""),
        }
        if uc.get("sample_conversation"):
            entry["sample_conversation"] = uc["sample_conversation"]
        uc_context.append(entry)

    # API spec summary
    api_summary = ""
    if agent.get("api_spec"):
        spec = agent["api_spec"]
        if isinstance(spec, dict) and "paths" in spec:
            lines = []
            for path, methods in spec["paths"].items():
                for method, details in methods.items():
                    if method in ("get","post","put","patch","delete"):
                        lines.append(f"  {method.upper()} {path}: {details.get('summary','')[:60]}")
            api_summary = "\n".join(lines)

    prompt = (
        "You are designing MCP (Model Context Protocol) tools for an AI agent operator.\n\n"
        f"Agent: {agent.get('name', '')}\n"
        f"Description: {agent.get('description', '')}\n"
        f"API Type: {agent.get('api_type', 'rest')}\n"
        f"Base URL: {agent.get('api_base_url', '')}\n"
        + (f"\nAPI Endpoints:\n{api_summary}\n" if api_summary else "")
        + f"\nCompleted Use Cases:\n{json.dumps(uc_context, indent=2, default=str)}\n\n"
        "Based on these completed use cases, generate MCP tool definitions.\n\n"
        "Rules:\n"
        "- Each tool should map to one or more use cases\n"
        "- Tool names must be snake_case\n"
        "- Related use cases can be combined into one tool if they share endpoints\n"
        "- Each tool needs: name, description, input_schema (JSON Schema), endpoints (from discovered_endpoints), use_case_ids\n"
        "- The input_schema should define the parameters the tool accepts\n\n"
        "Return a JSON array of tool objects. Each object:\n"
        '{\n'
        '  "name": "search_products",\n'
        '  "description": "Search products by keyword or category",\n'
        '  "input_schema": {"type": "object", "properties": {"query": {"type": "string", "description": "Search keyword"}}, "required": ["query"]},\n'
        '  "endpoints": [{"method": "GET", "path": "/products/search", "purpose": "..."}],\n'
        '  "use_case_ids": ["uuid1", "uuid2"]\n'
        '}\n\n'
        "Return ONLY a JSON array, no markdown fences."
    )

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)

    try:
        tools = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            tools = json.loads(text[start:end + 1])
        else:
            raise HTTPException(500, "Failed to parse AI response")

    if not isinstance(tools, list):
        raise HTTPException(500, "AI did not return a tools array")

    # Save tools (replace existing)
    tool_dicts = []
    for t in tools:
        tool_dicts.append({
            "agent_id": agent_id,
            "name": t.get("name", "unnamed_tool"),
            "description": t.get("description", ""),
            "input_schema": t.get("input_schema"),
            "endpoints": t.get("endpoints", []),
            "use_case_ids": t.get("use_case_ids", []),
            "status": "draft",
        })

    await wb_db.replace_tools(agent_id, tool_dicts)
    return await wb_db.list_tools(agent_id)


# ---- Use Cases CRUD ----

@router.get("/agents/{agent_id}/usecases", response_model=list[UseCaseOut])
async def list_use_cases(agent_id: str):
    return await wb_db.list_use_cases(agent_id)


@router.post("/agents/{agent_id}/usecases", response_model=UseCaseOut)
async def create_use_case(agent_id: str, body: UseCaseCreate):
    return await wb_db.create_use_case(agent_id, body.model_dump())


@router.get("/usecases/{uc_id}", response_model=UseCaseOut)
async def get_use_case(uc_id: str):
    uc = await wb_db.get_use_case(uc_id)
    if not uc:
        raise HTTPException(404, "Use case not found")
    return uc


@router.put("/usecases/{uc_id}", response_model=UseCaseOut)
async def update_use_case(uc_id: str, body: UseCaseUpdate):
    uc = await wb_db.update_use_case(uc_id, body.model_dump(exclude_none=True))
    if not uc:
        raise HTTPException(404, "Use case not found")
    return uc


@router.delete("/usecases/{uc_id}")
async def delete_use_case(uc_id: str):
    await wb_db.delete_use_case(uc_id)
    return {"ok": True}


@router.post("/usecases/{uc_id}/complete", response_model=UseCaseOut)
async def complete_use_case(uc_id: str):
    """Mark a use case as completed."""
    uc = await wb_db.get_use_case(uc_id)
    if not uc:
        raise HTTPException(404, "Use case not found")
    if uc.get("status") != "tested":
        raise HTTPException(400, "Use case must be in 'tested' status to mark complete")
    updated = await wb_db.update_use_case(uc_id, {"status": "completed"})
    if not updated:
        raise HTTPException(500, "Failed to update use case")
    return updated


@router.post("/suggest-use-case")
async def suggest_use_case(body: dict):
    """AI suggests trigger, user_input, expected_output, sample_conversation from name + description + agent API spec."""
    agent_id = body.get("agent_id", "")
    name = body.get("name", "")
    description = body.get("description", "")

    agent = await wb_db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    # Build context from agent info + API spec
    api_spec_summary = ""
    is_mcp = agent.get("api_type") == "mcp"
    if agent.get("api_spec"):
        spec = agent["api_spec"]
        if is_mcp and isinstance(spec, list):
            # MCP tool definitions — array of {name, description, inputSchema}
            tool_lines = []
            for tool in spec[:30]:
                tname = tool.get("name", "unnamed")
                tdesc = tool.get("description", "")[:80]
                tool_lines.append(f"  {tname} — {tdesc}")
            api_spec_summary = "\n".join(tool_lines)
        elif isinstance(spec, dict) and "paths" in spec:
            # OpenAPI spec
            endpoint_lines = []
            for path, methods in list(spec["paths"].items())[:30]:
                for method, details in methods.items():
                    if method in ("get", "post", "put", "patch", "delete"):
                        summary = details.get("summary", details.get("description", ""))[:80]
                        endpoint_lines.append(f"  {method.upper()} {path} — {summary}")
            api_spec_summary = "\n".join(endpoint_lines)

    import anthropic
    import os
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    spec_label = "MCP tools" if is_mcp else "API endpoints"
    api_section = f"{spec_label}:\n{api_spec_summary}" if api_spec_summary else "No API spec uploaded yet."

    prompt = (
        "You are helping design an AI agent use case. Given the use case name, description, and the agent's API, suggest the fields below.\n\n"
        f"Agent: {agent.get('name', '')}\n"
        f"Agent description: {agent.get('description', '')}\n"
        f"Agent API type: {agent.get('api_type', 'rest')}\n"
        f"{api_section}\n\n"
        f"Use case name: {name}\n"
        f"Use case description: {description}\n\n"
        "Return a JSON object with these fields:\n"
        '- "trigger_text": What question or event triggers this use case? (1-2 sentences)\n'
        '- "user_input": What information does the user/caller provide? (specific parameter names)\n'
        '- "expected_output": What should the response contain? (specific data fields)\n'
        '- "frequency": Estimated frequency (e.g. "~100/day", "~10/week")\n'
        '- "sample_conversation": A realistic 3-4 turn example dialogue between a user and the agent, formatted as:\n'
        "  User: ...\n  Agent: ...\n  User: ...\n  Agent: ...\n\n"
        "Return ONLY the JSON object, no markdown fences."
    )

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # Parse JSON (strip markdown fences if present)
    import re
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        result = {"error": "Failed to parse AI response", "raw": text}

    return result


# ---- Discovery & Testing ----

@router.put("/usecases/{uc_id}/discovery")
async def save_discovery_data(uc_id: str, body: dict):
    """Save edited discovery data (endpoints, behavior, tool_definition)."""
    uc = await wb_db.get_use_case(uc_id)
    if not uc:
        raise HTTPException(404, "Use case not found")
    endpoints = body.get("endpoints", [])
    behavior = body.get("behavior", "")
    await wb_db.save_discovery(uc_id, endpoints, behavior)
    return await wb_db.get_use_case(uc_id)


@router.post("/discover")
async def run_discovery(body: DiscoverRequest):
    agent = await wb_db.get_agent(body.agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    if not agent.get("api_spec"):
        raise HTTPException(400, "Agent has no API spec uploaded")

    uc = await wb_db.get_use_case(body.use_case_id)
    if not uc:
        raise HTTPException(404, "Use case not found")

    result = await discover(agent["api_spec"], uc)

    # Save discovery results
    await wb_db.save_discovery(
        body.use_case_id,
        result.get("endpoints", []),
        result.get("behavior", ""),
    )

    return result


@router.post("/test")
async def run_live_test(body: TestRequest):
    agent = await wb_db.get_agent(body.agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    if not agent.get("api_base_url"):
        raise HTTPException(400, "Agent has no API base URL")

    uc = await wb_db.get_use_case(body.use_case_id)
    if not uc:
        raise HTTPException(404, "Use case not found")
    if not uc.get("discovered_endpoints"):
        raise HTTPException(400, "Run discovery first")

    key_enc = await wb_db.get_agent_api_key_enc(body.agent_id)
    api_key = decrypt_api_key(key_enc) if key_enc else ""

    result = await run_test(
        base_url=agent["api_base_url"],
        api_key=api_key,
        auth_type=agent.get("api_auth_type", "bearer"),
        auth_config=agent.get("api_auth_config"),
        endpoints=uc["discovered_endpoints"],
        user_input=body.test_input,
        use_case=uc,
    )

    # Save test result
    await wb_db.save_test_result(body.use_case_id, {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "input": body.test_input,
        **result,
    })

    return result


# ---- Agent Specs ----

@router.post("/generate-spec", response_model=AgentSpecOut)
async def generate_spec(body: GenerateSpecRequest):
    import traceback
    try:
        agents = []
        for sid in body.agent_ids:
            s = await wb_db.get_agent(sid)
            if s:
                agents.append(s)
        if not agents:
            raise HTTPException(400, "No valid agents found")

        use_cases = []
        if body.use_case_ids:
            for ucid in body.use_case_ids:
                uc = await wb_db.get_use_case(ucid)
                if uc:
                    use_cases.append(uc)
        else:
            for sid in body.agent_ids:
                ucs = await wb_db.list_use_cases(sid)
                use_cases.extend(ucs)

        config_dict = body.config.model_dump() if body.config else None

        # Detect role: if any agent in the list is an orchestrator, use orchestrator generation
        role = "operator"
        connected_operators = None
        for a in agents:
            if a.get("agent_role") == "orchestrator":
                role = "orchestrator"
                break

        if role == "orchestrator":
            # Fetch connected operators from interactions (asks = operators this agent calls)
            connected_operators = []
            for a in agents:
                if a.get("agent_role") != "orchestrator":
                    continue
                interactions = await wb_db.get_interactions(a["id"])
                for ask in interactions.get("asks", []):
                    target_id = ask.get("target_agent_id")
                    if target_id:
                        op = await wb_db.get_agent(target_id)
                        if op:
                            connected_operators.append(op)

        org_settings = await wb_db.get_org_settings()

        result = await generate(
            body.agent_name, agents, use_cases,
            config=config_dict, role=role,
            connected_operators=connected_operators,
            org_settings=org_settings,
        )

        spec = await wb_db.create_spec({
            "name": body.agent_name,
            "agent_ids": body.agent_ids,
            "use_case_ids": [uc["id"] for uc in use_cases],
            "spec_markdown": result.get("spec_markdown", ""),
            "tools_json": result.get("tools_json", []),
            "system_prompt": result.get("system_prompt", ""),
            "skeleton_code": result.get("skeleton_code", ""),
        })

        for sid in body.agent_ids:
            await wb_db.update_agent_status(sid, "spec_generated")
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Generation failed: {type(e).__name__}: {str(e)}")

    return spec


@router.get("/specs", response_model=list[AgentSpecOut])
async def list_specs():
    return await wb_db.list_specs()


@router.get("/specs/{spec_id}", response_model=AgentSpecOut)
async def get_spec(spec_id: str):
    spec = await wb_db.get_spec(spec_id)
    if not spec:
        raise HTTPException(404, "Spec not found")
    return spec


@router.put("/specs/{spec_id}", response_model=AgentSpecOut)
async def update_spec(spec_id: str, body: dict):
    spec = await wb_db.update_spec(spec_id, body)
    if not spec:
        raise HTTPException(404, "Spec not found")
    return spec


@router.delete("/specs/{spec_id}")
async def delete_spec(spec_id: str):
    await wb_db.delete_spec(spec_id)
    return {"ok": True}


@router.get("/specs/{spec_id}/download")
async def download_spec(spec_id: str):
    spec = await wb_db.get_spec(spec_id)
    if not spec:
        raise HTTPException(404, "Spec not found")
    slug = spec["name"].lower().replace(" ", "_").replace("/", "_")
    filename = f"{slug}_spec.md"
    content = spec.get("spec_markdown", "")
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
