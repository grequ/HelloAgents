import type {
  System,
  SystemCreate,
  UseCase,
  UseCaseCreate,
  AgentSpec,
  DashboardData,
  DiscoveryResult,
  TestResult,
  ConnectionResult,
  SpecConfig,
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

// Systems
export async function listSystems(): Promise<System[]> {
  return request<System[]>("GET", "/systems");
}

export async function createSystem(data: SystemCreate): Promise<System> {
  return request<System>("POST", "/systems", data);
}

export async function getSystem(id: string): Promise<System> {
  return request<System>("GET", `/systems/${id}`);
}

export async function updateSystem(id: string, data: Record<string, unknown>): Promise<System> {
  return request<System>("PUT", `/systems/${id}`, data);
}

export async function deleteSystem(id: string): Promise<void> {
  return request<void>("DELETE", `/systems/${id}`);
}

export async function setSystemApiKey(id: string, apiKey: string): Promise<void> {
  return request<void>("POST", `/systems/${id}/api-key`, { api_key: apiKey });
}

export async function uploadSystemSpecJson(id: string, spec: unknown): Promise<void> {
  return request<void>("POST", `/systems/${id}/upload-spec-json`, spec);
}

export async function testSystemConnection(id: string): Promise<ConnectionResult> {
  return request<ConnectionResult>("POST", `/systems/${id}/test-connection`);
}

// Use cases (nested under system)
export async function listUseCases(systemId: string): Promise<UseCase[]> {
  return request<UseCase[]>("GET", `/systems/${systemId}/usecases`);
}

export async function createUseCase(systemId: string, data: UseCaseCreate): Promise<UseCase> {
  return request<UseCase>("POST", `/systems/${systemId}/usecases`, data);
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

export async function saveDiscovery(
  useCaseId: string,
  data: { endpoints?: unknown; behavior?: string },
): Promise<void> {
  return request<void>("PUT", `/usecases/${useCaseId}/discovery`, data);
}

// Discover & Test
export async function discover(systemId: string, useCaseId: string): Promise<DiscoveryResult> {
  return request<DiscoveryResult>("POST", "/discover", {
    system_id: systemId,
    use_case_id: useCaseId,
  });
}

export async function runTest(
  systemId: string,
  useCaseId: string,
  testInput: unknown,
): Promise<TestResult> {
  return request<TestResult>("POST", "/test", {
    system_id: systemId,
    use_case_id: useCaseId,
    test_input: testInput,
  });
}

// Spec generation
export async function generateSpec(
  agentName: string,
  systemIds: string[],
  useCaseIds: string[],
  config?: SpecConfig,
): Promise<AgentSpec> {
  return request<AgentSpec>("POST", "/generate-spec", {
    agent_name: agentName,
    system_ids: systemIds,
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

// Seed demo data
export async function seedDemoData(): Promise<void> {
  return request<void>("POST", "/seed");
}
