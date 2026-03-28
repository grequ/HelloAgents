// --- Agents ---

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  owner_team: string;
  agent_role: "operator" | "orchestrator";
  api_type: string;
  api_base_url: string;
  api_docs_url?: string;
  api_auth_type?: string;
  api_auth_config?: Record<string, unknown>;
  agent_config?: AgentConfig | null;
  has_api_key: boolean;
  has_api_spec: boolean;
  api_spec_endpoint_count?: number;
  api_endpoints?: { method: string; path: string; summary: string }[];
  status: string;
  use_case_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AgentConfig {
  agent_name: string;
  tech_stack: string;
  framework: string;
  agent_persona: string;
  deployment: string;
  error_handling: string;
  auth_notes: string;
  additional_context: string;
}

// --- Interactions (relational, stored in wb_agent_interactions) ---

export interface InteractionAsk {
  id?: string;
  target_agent_id: string;
  target_agent_name: string;
  use_case_ids: string[];
}

export interface InteractionProvides {
  id?: string;
  source_agent_id: string;
  source_agent_name: string;
  use_case_ids: string[];
}

export interface Interactions {
  asks: InteractionAsk[];
  provides_to: InteractionProvides[];
}

export interface AgentCreate {
  name: string;
  description?: string;
  category?: string;
  owner_team?: string;
  agent_role?: "operator" | "orchestrator";
  api_type?: string;
  api_base_url?: string;
}

// --- Use Cases ---

export interface Endpoint {
  method: string;
  path: string;
  purpose: string;
  parameters?: Record<string, unknown>;
  extracts?: string[];
}

export interface TestStepResult {
  endpoint: string;
  status_code: number;
  latency_ms: number;
  success: boolean;
  response: unknown;
  extracted?: Record<string, unknown>;
}

export interface TestResult {
  timestamp?: string;
  steps: TestStepResult[];
  total_latency_ms: number;
  agent_response?: string;
}

export interface UseCase {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  trigger_text: string;
  user_input: string;
  expected_output: string;
  frequency: string;
  is_write: boolean;
  sample_conversation?: string;
  status: string;
  discovered_endpoints?: Endpoint[];
  discovered_behavior?: string;
  test_results?: TestResult[];
  created_at?: string;
  updated_at?: string;
}

export interface UseCaseCreate {
  name: string;
  description?: string;
  trigger_text?: string;
  user_input?: string;
  expected_output?: string;
  frequency?: string;
  is_write?: boolean;
  sample_conversation?: string;
}

// --- Discovery ---

export interface DiscoveryResult {
  endpoints: Endpoint[];
  behavior: string;
  tool_definition?: unknown;
  suggested_response_template?: string;
}

// --- Agent Specs ---

export interface AgentSpec {
  id: string;
  name: string;
  status: string;
  spec_markdown: string;
  tools_json: unknown;
  system_prompt: string;
  skeleton_code: string;
  agent_ids: string[];
  use_case_ids: string[];
  depends_on?: string[];
  called_by?: string[];
  generated_at?: string;
}

export interface SpecConfig {
  tech_stack?: string;
  framework?: string;
  agent_role?: string;
  deployment?: string;
  interactions?: string;
  error_handling?: string;
  auth_notes?: string;
  additional_context?: string;
}

// --- Dashboard ---

export interface DashboardData {
  agents: Agent[];
  stats: {
    agents: Record<string, number>;
    use_cases: Record<string, number>;
    specs_total: number;
  };
}

// --- Connection Test ---

export interface ConnectionResult {
  ok: boolean;
  status_code?: number;
  error?: string;
}

// --- Trace (demo page) ---

export interface TraceStep {
  depth: number;
  agent: string;
  action: string;
  detail?: string;
  tool?: string;
  system?: string;
  input?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}
