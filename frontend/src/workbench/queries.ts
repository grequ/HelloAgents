import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type {
  SystemCreate,
  UseCaseCreate,
  SpecConfig,
  AgentSpec,
  AgentConfig,
} from "../types";

// Re-export key type
export type { AgentConfig };

// --- Query Keys ---

export const keys = {
  dashboard: ["dashboard"] as const,
  systems: ["systems"] as const,
  system: (id: string) => ["system", id] as const,
  useCases: (systemId: string) => ["useCases", systemId] as const,
  useCase: (id: string) => ["useCase", id] as const,
  interactions: (systemId: string) => ["interactions", systemId] as const,
  specs: ["specs"] as const,
  spec: (id: string) => ["spec", id] as const,
};

// --- Queries ---

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: api.getDashboard });
}

export function useSystems() {
  return useQuery({ queryKey: keys.systems, queryFn: api.listSystems });
}

export function useSystem(id: string) {
  return useQuery({
    queryKey: keys.system(id),
    queryFn: () => api.getSystem(id),
    enabled: !!id,
  });
}

export function useUseCases(systemId: string) {
  return useQuery({
    queryKey: keys.useCases(systemId),
    queryFn: () => api.listUseCases(systemId),
    enabled: !!systemId,
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

export function useInteractions(systemId: string) {
  return useQuery({
    queryKey: keys.interactions(systemId),
    queryFn: () => api.getInteractions(systemId),
    enabled: !!systemId,
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

// --- Mutations ---

export function useCreateSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SystemCreate) => api.createSystem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.systems });
    },
  });
}

export function useSaveAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: AgentConfig }) =>
      api.updateSystem(id, { agent_config: config }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.system(vars.id) });
    },
  });
}

export function useSaveInteractions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      systemId,
      asks,
      provides_to,
    }: {
      systemId: string;
      asks: { target_system_id: string; use_case_ids: string[] }[];
      provides_to: { source_system_id: string; use_case_ids: string[] }[];
    }) => api.saveInteractions(systemId, { asks, provides_to }),
    onSuccess: (_data, vars) => {
      // Invalidate interactions for ALL systems since cross-system references changed
      qc.invalidateQueries({ queryKey: ["interactions"] });
    },
  });
}

export function useDeleteSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSystem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.systems });
    },
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, apiKey }: { id: string; apiKey: string }) =>
      api.setSystemApiKey(id, apiKey),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.system(vars.id) });
    },
  });
}

export function useUploadSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, spec }: { id: string; spec: unknown }) =>
      api.uploadSystemSpecJson(id, spec),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.system(vars.id) });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => api.testSystemConnection(id),
  });
}

export function useCreateUseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ systemId, data }: { systemId: string; data: UseCaseCreate }) =>
      api.createUseCase(systemId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.useCases(vars.systemId) });
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
    mutationFn: ({ systemId, useCaseId }: { systemId: string; useCaseId: string }) =>
      api.discover(systemId, useCaseId),
  });
}

export function useRunTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      systemId,
      useCaseId,
      testInput,
    }: {
      systemId: string;
      useCaseId: string;
      testInput: unknown;
    }) => api.runTest(systemId, useCaseId, testInput),
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
      systemIds,
      useCaseIds,
      config,
    }: {
      agentName: string;
      systemIds: string[];
      useCaseIds: string[];
      config?: SpecConfig;
    }) => api.generateSpec(agentName, systemIds, useCaseIds, config),
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
      qc.invalidateQueries({ queryKey: keys.systems });
    },
  });
}
