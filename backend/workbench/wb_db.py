"""Database helpers for workbench tables."""

import json
import uuid
from db import get_pool


def _new_id() -> str:
    return str(uuid.uuid4())


def _parse_json_field(value):
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None
    return value


def _row_to_agent(row: dict) -> dict:
    key_enc = row.pop("api_key_enc", None)
    row["has_api_key"] = bool(key_enc)
    # Store masked preview of the key for display
    if key_enc:
        try:
            from workbench.crypto import decrypt_api_key
            plain = decrypt_api_key(key_enc)
            if len(plain) > 12:
                row["api_key_preview"] = plain[:5] + "..." + plain[-5:]
            else:
                row["api_key_preview"] = plain[:3] + "..." + plain[-3:] if len(plain) > 6 else "***"
        except Exception:
            row["api_key_preview"] = "***"
    else:
        row["api_key_preview"] = None
    spec = _parse_json_field(row.get("api_spec"))
    row["api_spec"] = spec
    row["has_api_spec"] = spec is not None
    endpoint_count = 0
    endpoints_list = []
    if spec and isinstance(spec, list):
        # MCP tool definitions — array of tools
        endpoint_count = len(spec)
        for tool in spec:
            endpoints_list.append({"method": "MCP", "path": tool.get("name", ""), "summary": tool.get("description", "")[:100]})
    elif spec and isinstance(spec, dict) and "paths" in spec:
        for path, methods in spec["paths"].items():
            for method, details in methods.items():
                if method in ("get", "post", "put", "patch", "delete"):
                    endpoint_count += 1
                    summary = details.get("summary", details.get("description", details.get("operationId", "")))
                    endpoints_list.append({"method": method.upper(), "path": path, "summary": (summary or "")[:100]})
    row["api_spec_endpoint_count"] = endpoint_count
    row["api_endpoints"] = endpoints_list
    row["api_auth_config"] = _parse_json_field(row.get("api_auth_config"))
    row["agent_config"] = _parse_json_field(row.get("agent_config"))
    return row


def _row_to_tool(row: dict) -> dict:
    row["input_schema"] = _parse_json_field(row.get("input_schema"))
    row["endpoints"] = _parse_json_field(row.get("endpoints")) or []
    row["use_case_ids"] = _parse_json_field(row.get("use_case_ids")) or []
    return row


def _row_to_use_case(row: dict) -> dict:
    row["discovered_endpoints"] = _parse_json_field(row.get("discovered_endpoints"))
    row["test_results"] = _parse_json_field(row.get("test_results"))
    return row


def _row_to_spec(row: dict) -> dict:
    row["agent_ids"] = _parse_json_field(row.get("agent_ids"))
    row["use_case_ids"] = _parse_json_field(row.get("use_case_ids"))
    row["tools_json"] = _parse_json_field(row.get("tools_json"))
    row["depends_on"] = _parse_json_field(row.get("depends_on"))
    row["called_by"] = _parse_json_field(row.get("called_by"))
    return row


# ---- Migrations (idempotent) ----

async def ensure_schema():
    """Run on startup to add any missing columns/tables and handle renames."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Rename wb_systems → wb_agents if old table still exists
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wb_systems'
            """)
            row = await cur.fetchone()
            if row[0] > 0:
                await cur.execute("RENAME TABLE wb_systems TO wb_agents")
                # Rename system_id → agent_id in wb_use_cases
                try:
                    await cur.execute("ALTER TABLE wb_use_cases CHANGE system_id agent_id CHAR(36) NOT NULL")
                except Exception:
                    pass
                # Rename columns in wb_agent_interactions if they exist
                try:
                    await cur.execute("ALTER TABLE wb_agent_interactions CHANGE from_system_id from_agent_id CHAR(36) NOT NULL")
                    await cur.execute("ALTER TABLE wb_agent_interactions CHANGE to_system_id to_agent_id CHAR(36) NOT NULL")
                except Exception:
                    pass
                # Rename system_ids → agent_ids in wb_agent_specs
                try:
                    await cur.execute("ALTER TABLE wb_agent_specs CHANGE system_ids agent_ids JSON")
                except Exception:
                    pass

            # Add agent_config column if missing
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_agents'
                  AND COLUMN_NAME = 'agent_config'
            """)
            row = await cur.fetchone()
            if row[0] == 0:
                await cur.execute("ALTER TABLE wb_agents ADD COLUMN agent_config JSON")

            # Add sample_conversation column to wb_use_cases if missing
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_use_cases'
                  AND COLUMN_NAME = 'sample_conversation'
            """)
            row = await cur.fetchone()
            if row[0] == 0:
                await cur.execute("ALTER TABLE wb_use_cases ADD COLUMN sample_conversation TEXT AFTER expected_output")

            # Drop priority column from wb_use_cases if it exists
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_use_cases'
                  AND COLUMN_NAME = 'priority'
            """)
            row = await cur.fetchone()
            if row[0] > 0:
                await cur.execute("ALTER TABLE wb_use_cases DROP COLUMN priority")

            # Drop is_write column from wb_use_cases if it exists
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_use_cases'
                  AND COLUMN_NAME = 'is_write'
            """)
            row = await cur.fetchone()
            if row[0] > 0:
                await cur.execute("ALTER TABLE wb_use_cases DROP COLUMN is_write")

            # Drop is_write column from wb_agent_tools if it exists
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_agent_tools'
                  AND COLUMN_NAME = 'is_write'
            """)
            row = await cur.fetchone()
            if row[0] > 0:
                await cur.execute("ALTER TABLE wb_agent_tools DROP COLUMN is_write")

            # Add api_spec_source column if missing
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_agents'
                  AND COLUMN_NAME = 'api_spec_source'
            """)
            row = await cur.fetchone()
            if row[0] == 0:
                await cur.execute("ALTER TABLE wb_agents ADD COLUMN api_spec_source TEXT AFTER api_spec")

            # Add agent_role column if missing
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_agents'
                  AND COLUMN_NAME = 'agent_role'
            """)
            row = await cur.fetchone()
            if row[0] == 0:
                await cur.execute("ALTER TABLE wb_agents ADD COLUMN agent_role VARCHAR(20) DEFAULT 'operator' AFTER owner_team")
                # Migrate existing: mcp/none types are likely orchestrators
                await cur.execute("UPDATE wb_agents SET agent_role = 'orchestrator' WHERE api_type IN ('mcp', 'none')")

            # Create interactions table if missing
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS wb_agent_interactions (
                    id              CHAR(36) PRIMARY KEY,
                    from_agent_id   CHAR(36) NOT NULL,
                    to_agent_id     CHAR(36) NOT NULL,
                    use_case_ids    JSON,
                    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (from_agent_id) REFERENCES wb_agents(id) ON DELETE CASCADE,
                    FOREIGN KEY (to_agent_id) REFERENCES wb_agents(id) ON DELETE CASCADE
                )
            """)

            # Add ai_model column to org_settings if missing
            await cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'wb_org_settings'
                  AND COLUMN_NAME = 'ai_model'
            """)
            row = await cur.fetchone()
            if row[0] == 0:
                try:
                    await cur.execute("ALTER TABLE wb_org_settings ADD COLUMN ai_model TEXT AFTER communication")
                except Exception:
                    pass

            # Create agent tools table if missing
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS wb_agent_tools (
                    id CHAR(36) PRIMARY KEY, agent_id CHAR(36) NOT NULL,
                    name VARCHAR(200) NOT NULL, description TEXT, input_schema JSON,
                    endpoints JSON, use_case_ids JSON,
                    status VARCHAR(20) DEFAULT 'draft',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (agent_id) REFERENCES wb_agents(id) ON DELETE CASCADE
                )
            """)

            # Create org settings table if missing
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS wb_org_settings (
                    id CHAR(36) PRIMARY KEY, tech_stack VARCHAR(200) DEFAULT 'Python 3.12',
                    framework VARCHAR(200) DEFAULT 'FastAPI + MCP SDK + anthropic SDK',
                    mcp_sdk_version VARCHAR(50) DEFAULT '1.x',
                    deployment VARCHAR(200) DEFAULT 'Docker containers',
                    error_handling TEXT, retry_strategy TEXT, logging TEXT, auth_pattern TEXT,
                    coding_standards TEXT, communication VARCHAR(200) DEFAULT 'MCP (Model Context Protocol)',
                    ai_model TEXT, org_rules TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            """)
            # Insert default row if empty
            await cur.execute("SELECT COUNT(*) FROM wb_org_settings")
            row = await cur.fetchone()
            if row[0] == 0:
                await cur.execute("""INSERT INTO wb_org_settings
                    (id, tech_stack, framework, mcp_sdk_version, deployment, communication,
                     error_handling, retry_strategy, logging, auth_pattern, coding_standards, ai_model, org_rules)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (_new_id(),
                     'Python 3.12',
                     'FastAPI + MCP Python SDK (mcp) + Anthropic Python SDK',
                     'mcp >= 1.0',
                     'Docker container per agent. One MCP server = one container. Orchestrated via Docker Compose or Kubernetes.',
                     'MCP (Model Context Protocol) over stdio or SSE. Every operator exposes tools via MCP. Orchestrators connect as MCP clients.',
                     'Fail fast on 4xx (client error — do not retry). Retry transient 5xx/timeouts with exponential backoff (1s, 2s, 4s). Return structured error to caller: {error: string, code: string, retryable: bool}. Never swallow exceptions silently.',
                     'Exponential backoff: base 1s, max 3 attempts, jitter ±200ms. Circuit breaker: open after 5 failures in 60s, half-open after 30s. Timeout: 10s per API call, 30s per tool execution.',
                     'Structured JSON to stdout (12-factor). Fields: timestamp, level, tool_name, operation, duration_ms, status. Correlation ID propagated across tool calls. PII redacted (mask emails, tokens, keys). Log every tool invocation and API call at INFO, errors at ERROR with full context.',
                     'Secrets via environment variables only — never in code, config files, or logs. MCP auth: bearer token in transport headers. Legacy API auth: per-operator config (bearer, API key header, OAuth2 client credentials). Rotate credentials via secrets manager.',
                     'Python: snake_case functions/variables, PascalCase classes, UPPER_SNAKE constants. Type hints on all function signatures. Docstrings on every tool handler (becomes the MCP tool description). async/await for all I/O. No global mutable state. Each tool handler is a pure function: inputs → API calls → structured output.',
                     'Claude Opus 4.6 (claude-opus-4-6) for spec generation and tool discovery — highest reasoning quality for architectural decisions and production code. Claude Sonnet 4 (claude-sonnet-4-20250514) for endpoint analysis and use case suggestions — balanced quality and speed. Claude Haiku 4.5 (claude-haiku-4-5-20251001) for test input generation and response composition — fast and cost-effective for simple tasks. All agents generated by AgentForge should use Claude Sonnet 4 as their runtime model for tool_use orchestration, unless the task requires deeper reasoning (upgrade to Opus) or is latency-sensitive (downgrade to Haiku).',
                     ''))


# ---- Organization Settings ----

async def get_org_settings() -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_org_settings LIMIT 1")
            return await cur.fetchone()

async def update_org_settings(data: dict) -> dict:
    pool = await get_pool()
    settings = await get_org_settings()
    if not settings:
        return {}
    fields = {k: v for k, v in data.items() if v is not None and k != "id"}
    if not fields:
        return settings
    sets = ", ".join(f"{k} = %s" for k in fields)
    vals = [*fields.values(), settings["id"]]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE wb_org_settings SET {sets} WHERE id = %s", vals)
    return await get_org_settings()


# ---- Agents ----

async def list_agents(role: str | None = None) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            query = """
                SELECT s.*, COUNT(DISTINCT uc.id) as use_case_count, COUNT(DISTINCT t.id) as tool_count
                FROM wb_agents s
                LEFT JOIN wb_use_cases uc ON uc.agent_id = s.id
                LEFT JOIN wb_agent_tools t ON t.agent_id = s.id
            """
            params = []
            if role:
                query += " WHERE s.agent_role = %s"
                params.append(role)
            query += " GROUP BY s.id ORDER BY s.name"
            await cur.execute(query, params)
            rows = await cur.fetchall()
    return [_row_to_agent(r) for r in rows]


async def get_agent(agent_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_agents WHERE id = %s", (agent_id,))
            row = await cur.fetchone()
    if row is None:
        return None
    return _row_to_agent(row)


async def create_agent(data: dict) -> dict:
    sid = _new_id()
    pool = await get_pool()
    cols = ["id", "name", "description", "category", "owner_team", "agent_role",
            "api_type", "api_base_url", "api_docs_url", "api_auth_type", "api_auth_config"]
    vals = [sid, data["name"], data.get("description", ""), data.get("category", ""),
            data.get("owner_team", ""), data.get("agent_role", "operator"), data.get("api_type", "rest"),
            data.get("api_base_url", ""), data.get("api_docs_url", ""),
            data.get("api_auth_type", "bearer"),
            json.dumps(data["api_auth_config"]) if data.get("api_auth_config") else None]
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(cols)
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"INSERT INTO wb_agents ({col_names}) VALUES ({placeholders})", vals)
    return await get_agent(sid)


async def update_agent(agent_id: str, data: dict) -> dict | None:
    pool = await get_pool()
    fields = {k: v for k, v in data.items() if v is not None}
    if "api_auth_config" in fields and isinstance(fields["api_auth_config"], dict):
        fields["api_auth_config"] = json.dumps(fields["api_auth_config"])
    if "agent_config" in fields and isinstance(fields["agent_config"], dict):
        fields["agent_config"] = json.dumps(fields["agent_config"])
    if not fields:
        return await get_agent(agent_id)
    sets = ", ".join(f"{k} = %s" for k in fields)
    vals = [*fields.values(), agent_id]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE wb_agents SET {sets} WHERE id = %s", vals)
    return await get_agent(agent_id)


async def delete_agent(agent_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM wb_agents WHERE id = %s", (agent_id,))


async def set_agent_api_key(agent_id: str, encrypted_key: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE wb_agents SET api_key_enc = %s WHERE id = %s",
                              (encrypted_key, agent_id))


async def get_agent_api_key_enc(agent_id: str) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT api_key_enc FROM wb_agents WHERE id = %s", (agent_id,))
            row = await cur.fetchone()
    return row["api_key_enc"] if row else None


async def set_agent_api_spec(agent_id: str, spec, source: str | None = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE wb_agents SET api_spec = %s, api_spec_source = %s, status = 'api_documented' WHERE id = %s",
                (json.dumps(spec), source, agent_id))


async def update_agent_status(agent_id: str, status: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE wb_agents SET status = %s WHERE id = %s", (status, agent_id))


# ---- Agent Tools ----

async def list_all_tools() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_agent_tools ORDER BY agent_id, name")
            rows = await cur.fetchall()
    return [_row_to_tool(r) for r in rows]


async def list_tools(agent_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_agent_tools WHERE agent_id = %s ORDER BY name",
                              (agent_id,))
            rows = await cur.fetchall()
    return [_row_to_tool(r) for r in rows]


async def get_tool(tool_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_agent_tools WHERE id = %s", (tool_id,))
            row = await cur.fetchone()
    if row is None:
        return None
    return _row_to_tool(row)


async def create_tool(data: dict) -> dict:
    tool_id = _new_id()
    pool = await get_pool()
    cols = ["id", "agent_id", "name", "description", "input_schema",
            "endpoints", "use_case_ids", "status"]
    vals = [tool_id, data["agent_id"], data["name"], data.get("description", ""),
            json.dumps(data.get("input_schema")) if data.get("input_schema") else None,
            json.dumps(data.get("endpoints", [])),
            json.dumps(data.get("use_case_ids", [])),
            data.get("status", "draft")]
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(cols)
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"INSERT INTO wb_agent_tools ({col_names}) VALUES ({placeholders})", vals)
    return await get_tool(tool_id)


async def update_tool(tool_id: str, data: dict) -> dict | None:
    pool = await get_pool()
    fields = {k: v for k, v in data.items() if v is not None}
    # JSON-encode complex fields
    for key in ("input_schema", "endpoints", "use_case_ids"):
        if key in fields and isinstance(fields[key], (dict, list)):
            fields[key] = json.dumps(fields[key])
    if not fields:
        return await get_tool(tool_id)
    sets = ", ".join(f"{k} = %s" for k in fields)
    vals = [*fields.values(), tool_id]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE wb_agent_tools SET {sets} WHERE id = %s", vals)
    return await get_tool(tool_id)


async def delete_tool(tool_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM wb_agent_tools WHERE id = %s", (tool_id,))


async def replace_tools(agent_id: str, tools: list[dict]):
    """Delete all tools for agent_id, then INSERT each new tool."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM wb_agent_tools WHERE agent_id = %s", (agent_id,))
            for t in tools:
                tool_id = _new_id()
                await cur.execute(
                    """INSERT INTO wb_agent_tools (id, agent_id, name, description, input_schema, endpoints, use_case_ids, status)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (tool_id, agent_id, t.get("name", ""), t.get("description", ""),
                     json.dumps(t.get("input_schema")) if t.get("input_schema") else None,
                     json.dumps(t.get("endpoints", [])),
                     json.dumps(t.get("use_case_ids", [])),
                     t.get("status", "draft")))


# ---- Use Cases ----

async def list_use_cases(agent_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_use_cases WHERE agent_id = %s ORDER BY name",
                              (agent_id,))
            rows = await cur.fetchall()
    return [_row_to_use_case(r) for r in rows]


async def get_use_case(uc_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_use_cases WHERE id = %s", (uc_id,))
            row = await cur.fetchone()
    if row is None:
        return None
    return _row_to_use_case(row)


async def create_use_case(agent_id: str, data: dict) -> dict:
    uc_id = _new_id()
    pool = await get_pool()
    cols = ["id", "agent_id", "name", "description", "trigger_text", "user_input",
            "expected_output", "frequency", "sample_conversation"]
    vals = [uc_id, agent_id, data["name"], data.get("description", ""),
            data.get("trigger_text", ""), data.get("user_input", ""),
            data.get("expected_output", ""), data.get("frequency", ""),
            data.get("sample_conversation", "")]
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(cols)
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"INSERT INTO wb_use_cases ({col_names}) VALUES ({placeholders})", vals)
    return await get_use_case(uc_id)


async def update_use_case(uc_id: str, data: dict) -> dict | None:
    pool = await get_pool()
    fields = {k: v for k, v in data.items() if v is not None}
    if not fields:
        return await get_use_case(uc_id)
    sets = ", ".join(f"{k} = %s" for k in fields)
    vals = [*fields.values(), uc_id]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE wb_use_cases SET {sets} WHERE id = %s", vals)
    return await get_use_case(uc_id)


async def delete_use_case(uc_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM wb_use_cases WHERE id = %s", (uc_id,))


async def save_discovery(uc_id: str, endpoints: list, behavior: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Only advance status forward, never backward
            await cur.execute(
                "UPDATE wb_use_cases SET discovered_endpoints = %s, discovered_behavior = %s, status = CASE WHEN status = 'draft' THEN 'discovered' ELSE status END WHERE id = %s",
                (json.dumps(endpoints), behavior, uc_id))


async def save_test_result(uc_id: str, result: dict):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT test_results FROM wb_use_cases WHERE id = %s", (uc_id,))
            row = await cur.fetchone()
    existing = _parse_json_field(row["test_results"]) if row else None
    if not isinstance(existing, list):
        existing = []
    existing.append(result)
    # Keep last 20 results
    existing = existing[-20:]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Only advance status forward, never backward from completed
            await cur.execute(
                "UPDATE wb_use_cases SET test_results = %s, status = CASE WHEN status IN ('draft', 'discovered') THEN 'tested' ELSE status END WHERE id = %s",
                (json.dumps(existing), uc_id))


# ---- Agent Specs ----

async def list_specs() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_agent_specs ORDER BY generated_at DESC")
            rows = await cur.fetchall()
    return [_row_to_spec(r) for r in rows]


async def get_spec(spec_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_agent_specs WHERE id = %s", (spec_id,))
            row = await cur.fetchone()
    if row is None:
        return None
    return _row_to_spec(row)


async def create_spec(data: dict) -> dict:
    spec_id = _new_id()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO wb_agent_specs
                   (id, name, agent_ids, use_case_ids, spec_markdown, tools_json, system_prompt, skeleton_code, depends_on, called_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (spec_id, data["name"],
                 json.dumps(data.get("agent_ids", [])),
                 json.dumps(data.get("use_case_ids", [])),
                 data.get("spec_markdown", ""),
                 json.dumps(data.get("tools_json", [])),
                 data.get("system_prompt", ""),
                 data.get("skeleton_code", ""),
                 json.dumps(data.get("depends_on", [])),
                 json.dumps(data.get("called_by", []))))
    return await get_spec(spec_id)


async def update_spec(spec_id: str, data: dict) -> dict | None:
    pool = await get_pool()
    fields = {}
    for k, v in data.items():
        if v is not None:
            if k in ("agent_ids", "use_case_ids", "tools_json", "depends_on", "called_by"):
                fields[k] = json.dumps(v)
            else:
                fields[k] = v
    if not fields:
        return await get_spec(spec_id)
    sets = ", ".join(f"{k} = %s" for k in fields)
    vals = [*fields.values(), spec_id]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE wb_agent_specs SET {sets} WHERE id = %s", vals)
    return await get_spec(spec_id)


async def delete_spec(spec_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM wb_agent_specs WHERE id = %s", (spec_id,))


# ---- Agent Interactions ----

async def get_all_interactions() -> list[dict]:
    """Return all interactions with agent names."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute(
                """SELECT i.id, i.from_agent_id, sf.name as from_agent_name,
                          i.to_agent_id, st.name as to_agent_name, i.use_case_ids
                   FROM wb_agent_interactions i
                   JOIN wb_agents sf ON sf.id = i.from_agent_id
                   JOIN wb_agents st ON st.id = i.to_agent_id""")
            rows = await cur.fetchall()
    for row in rows:
        row["use_case_ids"] = _parse_json_field(row.get("use_case_ids")) or []
    return rows


async def get_interactions(agent_id: str) -> dict:
    """Return asks (from=agent_id) and provides_to (to=agent_id) with agent names."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            # Outgoing: this agent calls others
            await cur.execute(
                """SELECT i.id, i.to_agent_id as target_agent_id, s.name as target_agent_name, i.use_case_ids
                   FROM wb_agent_interactions i
                   JOIN wb_agents s ON s.id = i.to_agent_id
                   WHERE i.from_agent_id = %s""", (agent_id,))
            asks = await cur.fetchall()
            # Incoming: others call this agent
            await cur.execute(
                """SELECT i.id, i.from_agent_id as source_agent_id, s.name as source_agent_name, i.use_case_ids
                   FROM wb_agent_interactions i
                   JOIN wb_agents s ON s.id = i.from_agent_id
                   WHERE i.to_agent_id = %s""", (agent_id,))
            provides_to = await cur.fetchall()
    for row in asks:
        row["use_case_ids"] = _parse_json_field(row.get("use_case_ids")) or []
    for row in provides_to:
        row["use_case_ids"] = _parse_json_field(row.get("use_case_ids")) or []
    return {"asks": asks, "provides_to": provides_to}


async def save_interactions(agent_id: str, asks: list[dict], provides_to: list[dict]):
    """Replace all interactions for an agent.
    asks: [{target_agent_id, use_case_ids}]  — this agent calls target
    provides_to: [{source_agent_id, use_case_ids}]  — source calls this agent
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Delete outgoing
            await cur.execute("DELETE FROM wb_agent_interactions WHERE from_agent_id = %s", (agent_id,))
            # Delete incoming
            await cur.execute("DELETE FROM wb_agent_interactions WHERE to_agent_id = %s", (agent_id,))
            # Insert outgoing (asks)
            for a in asks:
                iid = _new_id()
                await cur.execute(
                    "INSERT INTO wb_agent_interactions (id, from_agent_id, to_agent_id, use_case_ids) VALUES (%s, %s, %s, %s)",
                    (iid, agent_id, a["target_agent_id"], json.dumps(a.get("use_case_ids", []))))
            # Insert incoming (provides_to)
            for p in provides_to:
                iid = _new_id()
                await cur.execute(
                    "INSERT INTO wb_agent_interactions (id, from_agent_id, to_agent_id, use_case_ids) VALUES (%s, %s, %s, %s)",
                    (iid, p["source_agent_id"], agent_id, json.dumps(p.get("use_case_ids", []))))


# ---- Dashboard ----

async def get_dashboard_stats() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT COUNT(*) as total, status FROM wb_agents GROUP BY status")
            sys_rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total, status FROM wb_use_cases GROUP BY status")
            uc_rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total FROM wb_agent_specs")
            spec_row = await cur.fetchone()
    return {
        "agents": {r["status"]: r["total"] for r in sys_rows},
        "use_cases": {r["status"]: r["total"] for r in uc_rows},
        "specs_total": spec_row["total"] if spec_row else 0,
    }


def dict_cursor():
    import aiomysql
    return aiomysql.DictCursor
