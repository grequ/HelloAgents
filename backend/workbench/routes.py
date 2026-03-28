"""FastAPI routes for the Agent Migration Workbench."""

import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from workbench.models import (
    SystemCreate, SystemUpdate, SystemOut,
    UseCaseCreate, UseCaseUpdate, UseCaseOut,
    DiscoverRequest, TestRequest,
    GenerateSpecRequest, AgentSpecOut,
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
    systems = await wb_db.list_systems()
    return {"stats": stats, "systems": systems}


@router.post("/seed")
async def seed():
    from workbench.seed import seed_demo_data
    return await seed_demo_data()


# ---- Systems CRUD ----

@router.get("/systems", response_model=list[SystemOut])
async def list_systems():
    return await wb_db.list_systems()


@router.post("/systems", response_model=SystemOut)
async def create_system(body: SystemCreate):
    return await wb_db.create_system(body.model_dump())


@router.get("/systems/{system_id}", response_model=SystemOut)
async def get_system(system_id: str):
    s = await wb_db.get_system(system_id)
    if not s:
        raise HTTPException(404, "System not found")
    return s


@router.put("/systems/{system_id}", response_model=SystemOut)
async def update_system(system_id: str, body: SystemUpdate):
    s = await wb_db.update_system(system_id, body.model_dump(exclude_none=True))
    if not s:
        raise HTTPException(404, "System not found")
    return s


@router.delete("/systems/{system_id}")
async def delete_system(system_id: str):
    await wb_db.delete_system(system_id)
    return {"ok": True}


@router.post("/systems/{system_id}/api-key")
async def set_api_key(system_id: str, body: dict):
    key = body.get("api_key", "")
    if not key:
        raise HTTPException(400, "api_key is required")
    encrypted = encrypt_api_key(key)
    await wb_db.set_system_api_key(system_id, encrypted)
    return {"ok": True}


@router.post("/systems/{system_id}/upload-spec")
async def upload_spec(system_id: str, file: UploadFile = File(...)):
    content = await file.read()
    try:
        spec = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")
    await wb_db.set_system_api_spec(system_id, spec)
    return {"ok": True, "endpoint_count": len(spec.get("paths", {}))}


@router.post("/systems/{system_id}/upload-spec-json")
async def upload_spec_json(system_id: str, body: dict):
    """Accept API spec as JSON body (alternative to file upload)."""
    await wb_db.set_system_api_spec(system_id, body)
    return {"ok": True, "endpoint_count": len(body.get("paths", {}))}


@router.post("/systems/{system_id}/test-connection")
async def test_connection(system_id: str):
    s = await wb_db.get_system(system_id)
    if not s:
        raise HTTPException(404, "System not found")
    if not s.get("api_base_url"):
        raise HTTPException(400, "No API base URL configured")
    key_enc = await wb_db.get_system_api_key_enc(system_id)
    api_key = decrypt_api_key(key_enc) if key_enc else ""
    import httpx
    headers = {}
    if s.get("api_auth_type") == "bearer" and api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(s["api_base_url"], headers=headers)
        return {"ok": True, "status_code": resp.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---- Use Cases CRUD ----

@router.get("/systems/{system_id}/usecases", response_model=list[UseCaseOut])
async def list_use_cases(system_id: str):
    return await wb_db.list_use_cases(system_id)


@router.post("/systems/{system_id}/usecases", response_model=UseCaseOut)
async def create_use_case(system_id: str, body: UseCaseCreate):
    return await wb_db.create_use_case(system_id, body.model_dump())


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
    system = await wb_db.get_system(body.system_id)
    if not system:
        raise HTTPException(404, "System not found")
    if not system.get("api_spec"):
        raise HTTPException(400, "System has no API spec uploaded")

    uc = await wb_db.get_use_case(body.use_case_id)
    if not uc:
        raise HTTPException(404, "Use case not found")

    result = await discover(system["api_spec"], uc)

    # Save discovery results
    await wb_db.save_discovery(
        body.use_case_id,
        result.get("endpoints", []),
        result.get("behavior", ""),
    )

    return result


@router.post("/test")
async def run_live_test(body: TestRequest):
    system = await wb_db.get_system(body.system_id)
    if not system:
        raise HTTPException(404, "System not found")
    if not system.get("api_base_url"):
        raise HTTPException(400, "System has no API base URL")

    uc = await wb_db.get_use_case(body.use_case_id)
    if not uc:
        raise HTTPException(404, "Use case not found")
    if not uc.get("discovered_endpoints"):
        raise HTTPException(400, "Run discovery first")

    key_enc = await wb_db.get_system_api_key_enc(body.system_id)
    api_key = decrypt_api_key(key_enc) if key_enc else ""

    result = await run_test(
        base_url=system["api_base_url"],
        api_key=api_key,
        auth_type=system.get("api_auth_type", "bearer"),
        auth_config=system.get("api_auth_config"),
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
        systems = []
        for sid in body.system_ids:
            s = await wb_db.get_system(sid)
            if s:
                systems.append(s)
        if not systems:
            raise HTTPException(400, "No valid systems found")

        use_cases = []
        if body.use_case_ids:
            for ucid in body.use_case_ids:
                uc = await wb_db.get_use_case(ucid)
                if uc:
                    use_cases.append(uc)
        else:
            for sid in body.system_ids:
                ucs = await wb_db.list_use_cases(sid)
                use_cases.extend(ucs)

        config_dict = body.config.model_dump() if body.config else None
        result = await generate(body.agent_name, systems, use_cases, config=config_dict)

        spec = await wb_db.create_spec({
            "name": body.agent_name,
            "system_ids": body.system_ids,
            "use_case_ids": [uc["id"] for uc in use_cases],
            "spec_markdown": result.get("spec_markdown", ""),
            "tools_json": result.get("tools_json", []),
            "system_prompt": result.get("system_prompt", ""),
            "skeleton_code": result.get("skeleton_code", ""),
        })

        for sid in body.system_ids:
            await wb_db.update_system_status(sid, "spec_generated")
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
