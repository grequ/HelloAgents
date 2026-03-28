const BASE = '/workbench';

async function request(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? res.json() : res.text();
}

// Dashboard
export async function getDashboard() {
  return request('GET', '/dashboard');
}

// Systems
export async function listSystems() {
  return request('GET', '/systems');
}

export async function createSystem(data) {
  return request('POST', '/systems', data);
}

export async function getSystem(id) {
  return request('GET', `/systems/${id}`);
}

export async function updateSystem(id, data) {
  return request('PUT', `/systems/${id}`, data);
}

export async function deleteSystem(id) {
  return request('DELETE', `/systems/${id}`);
}

export async function setSystemApiKey(id, apiKey) {
  return request('POST', `/systems/${id}/api-key`, { api_key: apiKey });
}

export async function uploadSystemSpecJson(id, spec) {
  return request('POST', `/systems/${id}/upload-spec-json`, spec);
}

export async function testSystemConnection(id) {
  return request('POST', `/systems/${id}/test-connection`);
}

// Use cases (nested under system)
export async function listUseCases(systemId) {
  return request('GET', `/systems/${systemId}/usecases`);
}

export async function createUseCase(systemId, data) {
  return request('POST', `/systems/${systemId}/usecases`, data);
}

// Use cases (top-level)
export async function getUseCase(id) {
  return request('GET', `/usecases/${id}`);
}

export async function updateUseCase(id, data) {
  return request('PUT', `/usecases/${id}`, data);
}

export async function deleteUseCase(id) {
  return request('DELETE', `/usecases/${id}`);
}

// Save discovery edits
export async function saveDiscovery(useCaseId, data) {
  return request('PUT', `/usecases/${useCaseId}/discovery`, data);
}

// Discover & Test
export async function discover(systemId, useCaseId) {
  return request('POST', '/discover', { system_id: systemId, use_case_id: useCaseId });
}

export async function runTest(systemId, useCaseId, testInput) {
  return request('POST', '/test', { system_id: systemId, use_case_id: useCaseId, test_input: testInput });
}

// Spec generation
export async function generateSpec(agentName, systemIds, useCaseIds, config) {
  return request('POST', '/generate-spec', {
    agent_name: agentName,
    system_ids: systemIds,
    use_case_ids: useCaseIds,
    config: config || undefined,
  });
}

// Specs
export async function listSpecs() {
  return request('GET', '/specs');
}

export async function getSpec(id) {
  return request('GET', `/specs/${id}`);
}

export async function updateSpec(id, data) {
  return request('PUT', `/specs/${id}`, data);
}

export async function deleteSpec(id) {
  return request('DELETE', `/specs/${id}`);
}
