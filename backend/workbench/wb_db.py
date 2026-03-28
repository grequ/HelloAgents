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


def _row_to_system(row: dict) -> dict:
    row["has_api_key"] = bool(row.pop("api_key_enc", None))
    spec = _parse_json_field(row.get("api_spec"))
    row["api_spec"] = spec
    row["has_api_spec"] = spec is not None
    endpoint_count = 0
    if spec and isinstance(spec, dict) and "paths" in spec:
        for path_methods in spec["paths"].values():
            endpoint_count += len([m for m in path_methods if m in ("get", "post", "put", "patch", "delete")])
    row["api_spec_endpoint_count"] = endpoint_count
    row["api_auth_config"] = _parse_json_field(row.get("api_auth_config"))
    row["agent_config"] = _parse_json_field(row.get("agent_config"))
    return row


def _row_to_use_case(row: dict) -> dict:
    row["discovered_endpoints"] = _parse_json_field(row.get("discovered_endpoints"))
    row["test_results"] = _parse_json_field(row.get("test_results"))
    return row


def _row_to_spec(row: dict) -> dict:
    row["system_ids"] = _parse_json_field(row.get("system_ids"))
    row["use_case_ids"] = _parse_json_field(row.get("use_case_ids"))
    row["tools_json"] = _parse_json_field(row.get("tools_json"))
    row["depends_on"] = _parse_json_field(row.get("depends_on"))
    row["called_by"] = _parse_json_field(row.get("called_by"))
    return row


# ---- Systems ----

async def list_systems() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("""
                SELECT s.*, COUNT(uc.id) as use_case_count
                FROM wb_systems s
                LEFT JOIN wb_use_cases uc ON uc.system_id = s.id
                GROUP BY s.id ORDER BY s.name
            """)
            rows = await cur.fetchall()
    return [_row_to_system(r) for r in rows]


async def get_system(system_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_systems WHERE id = %s", (system_id,))
            row = await cur.fetchone()
    if row is None:
        return None
    return _row_to_system(row)


async def create_system(data: dict) -> dict:
    sid = _new_id()
    pool = await get_pool()
    cols = ["id", "name", "description", "category", "owner_team",
            "api_type", "api_base_url", "api_docs_url", "api_auth_type", "api_auth_config"]
    vals = [sid, data["name"], data.get("description", ""), data.get("category", ""),
            data.get("owner_team", ""), data.get("api_type", "rest"),
            data.get("api_base_url", ""), data.get("api_docs_url", ""),
            data.get("api_auth_type", "bearer"),
            json.dumps(data["api_auth_config"]) if data.get("api_auth_config") else None]
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(cols)
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"INSERT INTO wb_systems ({col_names}) VALUES ({placeholders})", vals)
    return await get_system(sid)


async def update_system(system_id: str, data: dict) -> dict | None:
    pool = await get_pool()
    fields = {k: v for k, v in data.items() if v is not None}
    if "api_auth_config" in fields and isinstance(fields["api_auth_config"], dict):
        fields["api_auth_config"] = json.dumps(fields["api_auth_config"])
    if "agent_config" in fields and isinstance(fields["agent_config"], dict):
        fields["agent_config"] = json.dumps(fields["agent_config"])
    if not fields:
        return await get_system(system_id)
    sets = ", ".join(f"{k} = %s" for k in fields)
    vals = [*fields.values(), system_id]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE wb_systems SET {sets} WHERE id = %s", vals)
    return await get_system(system_id)


async def delete_system(system_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM wb_systems WHERE id = %s", (system_id,))


async def set_system_api_key(system_id: str, encrypted_key: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE wb_systems SET api_key_enc = %s WHERE id = %s",
                              (encrypted_key, system_id))


async def get_system_api_key_enc(system_id: str) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT api_key_enc FROM wb_systems WHERE id = %s", (system_id,))
            row = await cur.fetchone()
    return row["api_key_enc"] if row else None


async def set_system_api_spec(system_id: str, spec: dict):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE wb_systems SET api_spec = %s, status = 'api_documented' WHERE id = %s",
                              (json.dumps(spec), system_id))


async def update_system_status(system_id: str, status: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE wb_systems SET status = %s WHERE id = %s", (status, system_id))


# ---- Use Cases ----

async def list_use_cases(system_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT * FROM wb_use_cases WHERE system_id = %s ORDER BY priority DESC, name",
                              (system_id,))
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


async def create_use_case(system_id: str, data: dict) -> dict:
    uc_id = _new_id()
    pool = await get_pool()
    cols = ["id", "system_id", "name", "description", "trigger_text", "user_input",
            "expected_output", "frequency", "is_write", "priority"]
    vals = [uc_id, system_id, data["name"], data.get("description", ""),
            data.get("trigger_text", ""), data.get("user_input", ""),
            data.get("expected_output", ""), data.get("frequency", ""),
            data.get("is_write", False), data.get("priority", "medium")]
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
            await cur.execute(
                "UPDATE wb_use_cases SET discovered_endpoints = %s, discovered_behavior = %s, status = 'discovered' WHERE id = %s",
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
            await cur.execute(
                "UPDATE wb_use_cases SET test_results = %s, status = 'tested' WHERE id = %s",
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
                   (id, name, system_ids, use_case_ids, spec_markdown, tools_json, system_prompt, skeleton_code, depends_on, called_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (spec_id, data["name"],
                 json.dumps(data.get("system_ids", [])),
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
            if k in ("system_ids", "use_case_ids", "tools_json", "depends_on", "called_by"):
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


# ---- Dashboard ----

async def get_dashboard_stats() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(dict_cursor()) as cur:
            await cur.execute("SELECT COUNT(*) as total, status FROM wb_systems GROUP BY status")
            sys_rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total, status FROM wb_use_cases GROUP BY status")
            uc_rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total FROM wb_agent_specs")
            spec_row = await cur.fetchone()
    return {
        "systems": {r["status"]: r["total"] for r in sys_rows},
        "use_cases": {r["status"]: r["total"] for r in uc_rows},
        "specs_total": spec_row["total"] if spec_row else 0,
    }


def dict_cursor():
    import aiomysql
    return aiomysql.DictCursor
