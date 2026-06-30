import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export interface DeployInstallation {
  id: string;
  name: string;
  description: string | null;
  group_name: string | null;
  order_index: number;
  container_name: string | null;
  compose_file: string | null;
  restart_command: string | null;
  ports: string[] | null;
  links: { label: string; url: string }[] | null;
  notes: string | null;
  product_id: string | null;
  product_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DockerContainer {
  name: string;
  image: string;
  status: string;
  ports: string;
  state: "running" | "stopped";
  health: "healthy" | "unhealthy" | "starting" | null;
}

export interface DeployInstallationCreate {
  name: string;
  description?: string | null;
  group_name?: string | null;
  order_index?: number;
  container_name?: string | null;
  compose_file?: string | null;
  restart_command?: string | null;
  ports?: string[] | null;
  links?: { label: string; url: string }[] | null;
  notes?: string | null;
  product_id?: string | null;
}

export type DeployInstallationUpdate = Partial<DeployInstallationCreate>;

const INSTALL_KEY = ["deploy", "installations"] as const;
const CONTAINERS_KEY = ["deploy", "containers"] as const;

export function useInstallations() {
  return useQuery<DeployInstallation[]>({
    queryKey: INSTALL_KEY,
    queryFn: () => apiClient.get("/api/v1/deploy/installations"),
    staleTime: 30_000,
  });
}

export function useDockerContainers() {
  return useQuery<DockerContainer[]>({
    queryKey: CONTAINERS_KEY,
    queryFn: () => apiClient.get("/api/v1/deploy/containers"),
    staleTime: 15_000,
    retry: false,
  });
}

export function useContainerLogs(containerName: string | null, lines = 200) {
  return useQuery<{ logs: string; container: string }>({
    queryKey: ["deploy", "logs", containerName, lines],
    queryFn: () =>
      apiClient.get(`/api/v1/deploy/containers/${containerName}/logs?lines=${lines}`),
    enabled: !!containerName,
    staleTime: 0,
  });
}

export function useCreateInstallation() {
  const qc = useQueryClient();
  return useMutation<DeployInstallation, Error, DeployInstallationCreate>({
    mutationFn: (data) => apiClient.post("/api/v1/deploy/installations", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: INSTALL_KEY }),
  });
}

export function useUpdateInstallation() {
  const qc = useQueryClient();
  return useMutation<
    DeployInstallation,
    Error,
    { id: string; data: DeployInstallationUpdate }
  >({
    mutationFn: ({ id, data }) =>
      apiClient.put(`/api/v1/deploy/installations/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: INSTALL_KEY }),
  });
}

export function useDeleteInstallation() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete(`/api/v1/deploy/installations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: INSTALL_KEY }),
  });
}

export function useRestartContainer() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; container: string }, Error, string>({
    mutationFn: (name) =>
      apiClient.post(`/api/v1/deploy/containers/${name}/restart`, {}),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: CONTAINERS_KEY }), 3000);
    },
  });
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  scope: string;
  labels: Record<string, string>;
  containers: string[];
}

export interface DockerNetworkContainer {
  name: string;
  ipv4: string;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  ipv6: boolean;
  subnets: string[];
  containers: DockerNetworkContainer[];
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  names_created: string[];
  names_updated: string[];
}

export function useDockerVolumes() {
  return useQuery<DockerVolume[]>({
    queryKey: ["deploy", "volumes"],
    queryFn: () => apiClient.get("/api/v1/deploy/volumes"),
    staleTime: 30_000,
    retry: false,
  });
}

export function useDockerNetworks() {
  return useQuery<DockerNetwork[]>({
    queryKey: ["deploy", "networks"],
    queryFn: () => apiClient.get("/api/v1/deploy/networks"),
    staleTime: 30_000,
    retry: false,
  });
}

export function useSyncFromDocker() {
  const qc = useQueryClient();
  return useMutation<SyncResult, Error>({
    mutationFn: () => apiClient.post("/api/v1/deploy/sync", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: INSTALL_KEY }),
  });
}
