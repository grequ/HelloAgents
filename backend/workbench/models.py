"""Pydantic models for workbench API."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# --- Systems ---

class SystemCreate(BaseModel):
    name: str
    description: str = ""
    category: str = ""
    owner_team: str = ""
    api_type: str = "rest"
    api_base_url: str = ""
    api_docs_url: str = ""
    api_auth_type: str = "bearer"
    api_auth_config: dict | None = None


class SystemUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    owner_team: str | None = None
    api_type: str | None = None
    api_base_url: str | None = None
    api_docs_url: str | None = None
    api_auth_type: str | None = None
    api_auth_config: dict | None = None


class SystemOut(BaseModel):
    id: str
    name: str
    description: str | None
    category: str | None
    owner_team: str | None
    api_type: str
    api_base_url: str | None
    api_docs_url: str | None
    api_auth_type: str
    api_auth_config: dict | None
    has_api_key: bool = False
    has_api_spec: bool = False
    api_spec_endpoint_count: int = 0
    status: str
    use_case_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


# --- Use Cases ---

class UseCaseCreate(BaseModel):
    name: str
    description: str = ""
    trigger_text: str = ""
    user_input: str = ""
    expected_output: str = ""
    frequency: str = ""
    is_write: bool = False
    priority: str = "medium"


class UseCaseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_text: str | None = None
    user_input: str | None = None
    expected_output: str | None = None
    frequency: str | None = None
    is_write: bool | None = None
    priority: str | None = None


class UseCaseOut(BaseModel):
    id: str
    system_id: str
    name: str
    description: str | None
    trigger_text: str | None
    user_input: str | None
    expected_output: str | None
    frequency: str | None
    is_write: bool
    priority: str
    discovered_endpoints: list | None = None
    discovered_behavior: str | None = None
    test_results: list | None = None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


# --- Discovery & Testing ---

class DiscoverRequest(BaseModel):
    system_id: str
    use_case_id: str


class TestRequest(BaseModel):
    system_id: str
    use_case_id: str
    test_input: dict


# --- Agent Specs ---

class SpecConfig(BaseModel):
    tech_stack: str = "Python 3.11"
    framework: str = "FastAPI + anthropic SDK"
    python_version: str = "3.11"
    agent_role: str = ""
    deployment: str = ""
    interactions: str = ""
    error_handling: str = ""
    auth_notes: str = ""
    additional_context: str = ""


class GenerateSpecRequest(BaseModel):
    agent_name: str
    system_ids: list[str]
    use_case_ids: list[str] = []
    config: SpecConfig | None = None


class AgentSpecOut(BaseModel):
    id: str
    name: str
    system_ids: list | None
    use_case_ids: list | None
    spec_markdown: str | None
    tools_json: list | None
    system_prompt: str | None
    skeleton_code: str | None
    depends_on: list | None
    called_by: list | None
    status: str
    generated_at: datetime | None = None
