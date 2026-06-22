import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Tool-versions domain -- backs the Dashboard's CLI tool-version card
 * (Hermes/Claude/Codex/Antigravity). See backend/app/api/routes/toolversions.py.
 */

export const monitoredToolSchema = z.enum(["hermes", "claude", "codex", "antigravity"]);
export type MonitoredTool = z.infer<typeof monitoredToolSchema>;

export const toolVersionSchema = z.object({
  id: z.string(),
  tool: monitoredToolSchema,
  installed_version: z.string().nullable(),
  latest_version: z.string().nullable(),
  update_available: z.boolean(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ToolVersion = z.infer<typeof toolVersionSchema>;

export const toolUpdateResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().nullable(),
  status: toolVersionSchema,
});
export type ToolUpdateResult = z.infer<typeof toolUpdateResultSchema>;

export const toolSyncSettingSchema = z.object({ enabled: z.boolean() });
export type ToolSyncSetting = z.infer<typeof toolSyncSettingSchema>;

const RESOURCE = "/api/v1/tool-versions";

export const toolVersionKeys = {
  list: ["tool-versions"] as const,
  sync: ["tool-versions", "sync"] as const,
};

export function useToolVersions() {
  return useQuery({
    queryKey: toolVersionKeys.list,
    queryFn: () => apiClient.get<ToolVersion[]>(RESOURCE),
  });
}

export function useCheckToolVersions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<ToolVersion[]>(`${RESOURCE}/check`),
    onSuccess: (data) => queryClient.setQueryData(toolVersionKeys.list, data),
  });
}

export function useUpdateTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tool: MonitoredTool) => apiClient.post<ToolUpdateResult>(`${RESOURCE}/${tool}/update`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: toolVersionKeys.list }),
  });
}

export function useToolSyncSetting() {
  return useQuery({
    queryKey: toolVersionKeys.sync,
    queryFn: () => apiClient.get<ToolSyncSetting>(`${RESOURCE}/sync`),
  });
}

export function useSetToolSyncSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => apiClient.put<ToolSyncSetting>(`${RESOURCE}/sync`, { enabled }),
    onSuccess: (data) => queryClient.setQueryData(toolVersionKeys.sync, data),
  });
}
