import type {
  Agent,
  AgentCreate,
  AgentTool,
  UseCase,
  UseCaseCreate,
  AgentSpec,
  DashboardData,
  DiscoveryResult,
  TestResult,
  ConnectionResult,
  SpecConfig,
  Interactions,
  OrgSettings,
} from "../types";

const BASE = "/workbench";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

// Dashboard
export async function getDashboard(): Promise<DashboardData> {
  return request<DashboardData>("GET", "/dashboard");
}

// Agents
export async function listAgents(): Promise<Agent[]> {
  return request<Agent[]>("GET", "/agents");
}

export async function createAgent(data: AgentCreate): Promise<Agent> {
  return request<Agent>("POST", "/agents", data);
}

export async function getAgent(id: string): Promise<Agent> {
  return request<Agent>("GET", `/agents/${id}`);
}

export async function updateAgent(id: string, data: Record<string, unknown>): Promise<Agent> {
  return request<Agent>("PUT", `/agents/${id}`, data);
}

export async function deleteAgent(id: string): Promise<void> {
  return request<void>("DELETE", `/agents/${id}`);
}

export async function setAgentApiKey(id: string, apiKey: string): Promise<void> {
  return request<void>("POST", `/agents/${id}/api-key`, { api_key: apiKey });
}

export async function uploadAgentSpecJson(id: string, spec: unknown, source?: string): Promise<void> {
  return request<void>("POST", `/agents/${id}/upload-spec-json`, { spec, source });
}

export async function testAgentConnection(id: string): Promise<ConnectionResult> {
  return request<ConnectionResult>("POST", `/agents/${id}/test-connection`);
}

export async function fetchUrl(url: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("POST", "/fetch-url", { url });
}

export async function testUrl(url: string, apiKey: string, authType: string): Promise<ConnectionResult> {
  return request<ConnectionResult>("POST", "/test-url", { url, api_key: apiKey, auth_type: authType });
}

export async function listOperators(): Promise<Agent[]> {
  return request<Agent[]>("GET", "/agents/operators");
}

// Interactions (relational)
export interface InteractionRow {
  id: string;
  from_agent_id: string;
  from_agent_name: string;
  to_agent_id: string;
  to_agent_name: string;
  use_case_ids: string[];
}

export async function getAllInteractions(): Promise<InteractionRow[]> {
  return request<InteractionRow[]>("GET", "/interactions");
}

export async function getInteractions(agentId: string): Promise<Interactions> {
  return request<Interactions>("GET", `/agents/${agentId}/interactions`);
}

export async function saveInteractions(
  agentId: string,
  data: {
    asks: { target_agent_id: string; use_case_ids: string[] }[];
    provides_to: { source_agent_id: string; use_case_ids: string[] }[];
  },
): Promise<Interactions> {
  return request<Interactions>("PUT", `/agents/${agentId}/interactions`, data);
}

// Use cases (nested under agent)
export async function listUseCases(agentId: string): Promise<UseCase[]> {
  return request<UseCase[]>("GET", `/agents/${agentId}/usecases`);
}

export async function createUseCase(agentId: string, data: UseCaseCreate): Promise<UseCase> {
  return request<UseCase>("POST", `/agents/${agentId}/usecases`, data);
}

// Use cases (top-level)
export async function getUseCase(id: string): Promise<UseCase> {
  return request<UseCase>("GET", `/usecases/${id}`);
}

export async function updateUseCase(id: string, data: Partial<UseCaseCreate>): Promise<UseCase> {
  return request<UseCase>("PUT", `/usecases/${id}`, data);
}

export async function deleteUseCase(id: string): Promise<void> {
  return request<void>("DELETE", `/usecases/${id}`);
}

export async function completeUseCase(id: string): Promise<UseCase> {
  return request<UseCase>("POST", `/usecases/${id}/complete`);
}

export async function saveDiscovery(
  useCaseId: string,
  data: { endpoints?: unknown; behavior?: string },
): Promise<void> {
  return request<void>("PUT", `/usecases/${useCaseId}/discovery`, data);
}

// AI Suggest
export interface AiSuggestion {
  trigger_text?: string;
  user_input?: string;
  expected_output?: string;
  frequency?: string;
  is_write?: boolean;
  sample_conversation?: string;
  error?: string;
}

export async function suggestUseCase(
  agentId: string,
  name: string,
  description: string,
): Promise<AiSuggestion> {
  return request<AiSuggestion>("POST", "/suggest-use-case", {
    agent_id: agentId,
    name,
    description,
  });
}

// Generate test input (AI-powered)
export async function generateTestInput(data: {
  endpoints: unknown[];
  user_input: string;
  behavior: string;
  use_case_name: string;
  agent_name: string;
  base_url: string;
}): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("POST", "/generate-test-input", data);
}

// Discover endpoints (AI-powered)
export interface DiscoveredEndpoint {
  method: string;
  path: string;
  summary: string;
  is_write?: boolean;
}

export async function discoverEndpoints(spec: unknown, agentName: string): Promise<DiscoveredEndpoint[]> {
  return request<DiscoveredEndpoint[]>("POST", "/discover-endpoints", { spec, agent_name: agentName });
}

// Agent Tools
export async function listTools(agentId: string): Promise<AgentTool[]> {
  return request<AgentTool[]>("GET", `/agents/${agentId}/tools`);
}

export async function updateTool(toolId: string, data: Partial<AgentTool>): Promise<AgentTool> {
  return request<AgentTool>("PUT", `/agents/tools/${toolId}`, data);
}

export async function deleteTool(toolId: string): Promise<void> {
  return request<void>("DELETE", `/agents/tools/${toolId}`);
}

export async function discoverTools(agentId: string): Promise<AgentTool[]> {
  return request<AgentTool[]>("POST", `/agents/${agentId}/discover-tools`);
}

// Discover & Test
export async function discover(agentId: string, useCaseId: string): Promise<DiscoveryResult> {
  return request<DiscoveryResult>("POST", "/discover", {
    agent_id: agentId,
    use_case_id: useCaseId,
  });
}

export async function runTest(
  agentId: string,
  useCaseId: string,
  testInput: unknown,
): Promise<TestResult> {
  return request<TestResult>("POST", "/test", {
    agent_id: agentId,
    use_case_id: useCaseId,
    test_input: testInput,
  });
}

// Spec generation
export async function generateSpec(
  agentName: string,
  agentIds: string[],
  useCaseIds: string[],
  config?: SpecConfig,
): Promise<AgentSpec> {
  return request<AgentSpec>("POST", "/generate-spec", {
    agent_name: agentName,
    agent_ids: agentIds,
    use_case_ids: useCaseIds,
    config: config || undefined,
  });
}

// Specs
export async function listSpecs(): Promise<AgentSpec[]> {
  return request<AgentSpec[]>("GET", "/specs");
}

export async function getSpec(id: string): Promise<AgentSpec> {
  return request<AgentSpec>("GET", `/specs/${id}`);
}

export async function updateSpec(id: string, data: Partial<AgentSpec>): Promise<AgentSpec> {
  return request<AgentSpec>("PUT", `/specs/${id}`, data);
}

export async function deleteSpec(id: string): Promise<void> {
  return request<void>("DELETE", `/specs/${id}`);
}

// Org Settings
export async function getOrgSettings(): Promise<OrgSettings> {
  return request<OrgSettings>("GET", "/settings");
}

export async function updateOrgSettings(data: Partial<OrgSettings>): Promise<OrgSettings> {
  return request<OrgSettings>("PUT", "/settings", data);
}

// Seed demo data
export async function seedDemoData(): Promise<void> {
  return request<void>("POST", "/seed");
}
