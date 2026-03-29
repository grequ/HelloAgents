"""Pydantic models for workbench API."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# --- Organization Settings ---

class OrgSettingsOut(BaseModel):
    id: str
    tech_stack: str = "Python 3.12"
    framework: str = "FastAPI + MCP SDK + anthropic SDK"
    mcp_sdk_version: str = "1.x"
    deployment: str = "Docker containers"
    error_handling: str | None = None
    retry_strategy: str | None = None
    logging: str | None = None
    auth_pattern: str | None = None
    coding_standards: str | None = None
    communication: str = "MCP (Model Context Protocol)"
    org_rules: str | None = None
    updated_at: datetime | None = None


# --- Agents ---

class AgentCreate(BaseModel):
    name: str
    description: str = ""
    category: str = ""
    owner_team: str = ""
    agent_role: str = "operator"
    api_type: str = "rest"
    api_base_url: str = ""
    api_docs_url: str = ""
    api_auth_type: str = "bearer"
    api_auth_config: dict | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    owner_team: str | None = None
    agent_role: str | None = None
    api_type: str | None = None
    api_base_url: str | None = None
    api_docs_url: str | None = None
    api_auth_type: str | None = None
    api_auth_config: dict | None = None
    agent_config: dict | None = None


class AgentOut(BaseModel):
    id: str
    name: str
    description: str | None
    category: str | None
    owner_team: str | None
    agent_role: str = "operator"
    api_type: str
    api_base_url: str | None
    api_docs_url: str | None
    api_auth_type: str
    api_auth_config: dict | None
    agent_config: dict | None = None
    has_api_key: bool = False
    api_key_preview: str | None = None
    has_api_spec: bool = False
    api_spec_source: str | None = None
    api_spec_endpoint_count: int = 0
    api_endpoints: list = []
    status: str
    use_case_count: int = 0
    tool_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


# --- Agent Tools ---

class AgentToolOut(BaseModel):
    id: str
    agent_id: str
    name: str
    description: str | None
    input_schema: dict | None = None
    endpoints: list | None = None
    use_case_ids: list | None = None
    is_write: bool = False
    status: str = "draft"
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
    sample_conversation: str = ""


class UseCaseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_text: str | None = None
    user_input: str | None = None
    expected_output: str | None = None
    frequency: str | None = None
    is_write: bool | None = None
    sample_conversation: str | None = None


class UseCaseOut(BaseModel):
    id: str
    agent_id: str
    name: str
    description: str | None
    trigger_text: str | None
    user_input: str | None
    expected_output: str | None
    frequency: str | None
    is_write: bool
    sample_conversation: str | None
    discovered_endpoints: list | None = None
    discovered_behavior: str | None = None
    test_results: list | None = None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


# --- Discovery & Testing ---

class DiscoverRequest(BaseModel):
    agent_id: str
    use_case_id: str


class TestRequest(BaseModel):
    agent_id: str
    use_case_id: str
    test_input: dict


# --- Agent Specs ---

class SpecConfig(BaseModel):
    tech_stack: str = "Python 3.11"
    framework: str = "FastAPI + anthropic SDK"
    python_version: str = "3.11"
    agent_persona: str = ""
    deployment: str = ""
    interactions: str = ""
    error_handling: str = ""
    auth_notes: str = ""
    additional_context: str = ""


class GenerateSpecRequest(BaseModel):
    agent_name: str
    agent_ids: list[str]
    use_case_ids: list[str] = []
    config: SpecConfig | None = None


class AgentSpecOut(BaseModel):
    id: str
    name: str
    agent_ids: list | None
    use_case_ids: list | None
    spec_markdown: str | None
    tools_json: list | None
    system_prompt: str | None
    skeleton_code: str | None
    depends_on: list | None
    called_by: list | None
    status: str
    generated_at: datetime | None = None
