import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type {
  AgentCreate,
  AgentTool,
  UseCaseCreate,
  SpecConfig,
  AgentSpec,
  AgentConfig,
  OrgSettings,
} from "../types";

// Re-export key type
export type { AgentConfig };

// --- Query Keys ---

export const keys = {
  dashboard: ["dashboard"] as const,
  agents: ["agents"] as const,
  agent: (id: string) => ["agent", id] as const,
  useCases: (agentId: string) => ["useCases", agentId] as const,
  useCase: (id: string) => ["useCase", id] as const,
  interactions: (agentId: string) => ["interactions", agentId] as const,
  tools: (agentId: string) => ["tools", agentId] as const,
  specs: ["specs"] as const,
  spec: (id: string) => ["spec", id] as const,
};

// --- Queries ---

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: api.getDashboard });
}

export function useAgents() {
  return useQuery({ queryKey: keys.agents, queryFn: api.listAgents });
}

export function useOperators() {
  return useQuery({ queryKey: ["operators"], queryFn: api.listOperators });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: keys.agent(id),
    queryFn: () => api.getAgent(id),
    enabled: !!id,
  });
}

export function useUseCases(agentId: string) {
  return useQuery({
    queryKey: keys.useCases(agentId),
    queryFn: () => api.listUseCases(agentId),
    enabled: !!agentId,
  });
}

export function useUseCase(id: string) {
  return useQuery({
    queryKey: keys.useCase(id),
    queryFn: () => api.getUseCase(id),
    enabled: !!id,
  });
}

export function useAllInteractions() {
  return useQuery({
    queryKey: ["interactions", "all"] as const,
    queryFn: api.getAllInteractions,
  });
}

export function useInteractions(agentId: string) {
  return useQuery({
    queryKey: keys.interactions(agentId),
    queryFn: () => api.getInteractions(agentId),
    enabled: !!agentId,
  });
}

export function useTools(agentId: string) {
  return useQuery({
    queryKey: keys.tools(agentId),
    queryFn: () => api.listTools(agentId),
    enabled: !!agentId,
  });
}

export function useSpecs() {
  return useQuery({ queryKey: keys.specs, queryFn: api.listSpecs });
}

export function useSpec(id: string) {
  return useQuery({
    queryKey: keys.spec(id),
    queryFn: () => api.getSpec(id),
    enabled: !!id,
  });
}

// --- Org Settings ---

export function useOrgSettings() {
  return useQuery({ queryKey: ["orgSettings"], queryFn: api.getOrgSettings });
}

export function useUpdateOrgSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<OrgSettings>) => api.updateOrgSettings(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orgSettings"] }); },
  });
}

// --- Mutations ---

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentCreate) => api.createAgent(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.agents });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.updateAgent(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.agent(vars.id) });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useSaveAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: AgentConfig }) =>
      api.updateAgent(id, { agent_config: config }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.agent(vars.id) });
    },
  });
}

export function useSaveInteractions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      asks,
      provides_to,
    }: {
      agentId: string;
      asks: { target_agent_id: string; use_case_ids: string[] }[];
      provides_to: { source_agent_id: string; use_case_ids: string[] }[];
    }) => api.saveInteractions(agentId, { asks, provides_to }),
    onSuccess: (_data, vars) => {
      // Invalidate interactions for ALL agents since cross-agent references changed
      qc.invalidateQueries({ queryKey: ["interactions"] });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAgent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.agents });
    },
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, apiKey }: { id: string; apiKey: string }) =>
      api.setAgentApiKey(id, apiKey),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.agent(vars.id) });
    },
  });
}

export function useUploadSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, spec, source }: { id: string; spec: unknown; source?: string }) =>
      api.uploadAgentSpecJson(id, spec, source),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.agent(vars.id) });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => api.testAgentConnection(id),
  });
}

export function useCreateUseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: UseCaseCreate }) =>
      api.createUseCase(agentId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.useCases(vars.agentId) });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useUpdateUseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UseCaseCreate> }) =>
      api.updateUseCase(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.useCase(vars.id) });
    },
  });
}

export function useDeleteUseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteUseCase(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: ["useCases"] });
    },
  });
}

export function useCompleteUseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.completeUseCase(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: keys.useCase(id) });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useUpdateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AgentTool> }) =>
      api.updateTool(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
    },
  });
}

export function useDeleteTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTool(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
    },
  });
}

export function useDiscoverTools() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.discoverTools(agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
    },
  });
}

export function useSaveDiscovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      useCaseId,
      data,
    }: {
      useCaseId: string;
      data: { endpoints?: unknown; behavior?: string };
    }) => api.saveDiscovery(useCaseId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.useCase(vars.useCaseId) });
    },
  });
}

export function useDiscover() {
  return useMutation({
    mutationFn: ({ agentId, useCaseId }: { agentId: string; useCaseId: string }) =>
      api.discover(agentId, useCaseId),
  });
}

export function useRunTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      useCaseId,
      testInput,
    }: {
      agentId: string;
      useCaseId: string;
      testInput: unknown;
    }) => api.runTest(agentId, useCaseId, testInput),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.useCase(vars.useCaseId) });
    },
  });
}

export function useGenerateSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentName,
      agentIds,
      useCaseIds,
      config,
    }: {
      agentName: string;
      agentIds: string[];
      useCaseIds: string[];
      config?: SpecConfig;
    }) => api.generateSpec(agentName, agentIds, useCaseIds, config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.specs });
    },
  });
}

export function useUpdateSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AgentSpec> }) =>
      api.updateSpec(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.spec(vars.id) });
      qc.invalidateQueries({ queryKey: keys.specs });
    },
  });
}

export function useDeleteSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSpec(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.specs });
    },
  });
}

export function useSeedDemoData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.seedDemoData(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.agents });
    },
  });
}
