import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Project domain (see docs/SPEC.md 4.2 Project Domain):
 *   projects, project_plans, plan_baselines, change_requests
 *
 * Project is the primary entity. It is linked to a product version and
 * carries a nested ProjectPlan (scope/schedule/baseline/estimates).
 */

export const PROJECT_STATUSES = [
  "planned",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const projectPlanSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  scope_summary: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  target_date: z.string().nullable().optional(),
  estimated_cost: z.number().nullable().optional(),
  is_baselined: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ProjectPlan = z.infer<typeof projectPlanSchema>;

export const planBaselineSchema = z.object({
  id: z.string(),
  project_plan_id: z.string(),
  version_label: z.string().optional(),
  baselined_at: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export type PlanBaseline = z.infer<typeof planBaselineSchema>;

export const changeRequestSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  created_at: z.string().optional(),
});

export type ChangeRequest = z.infer<typeof changeRequestSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  product_version_id: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).default("planned"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  plan: projectPlanSchema.nullable().optional(),
});

export type Project = z.infer<typeof projectSchema>;

// Payload schemas (what the create/edit form submits).
export const projectCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name is too long"),
  description: z.string().max(2000, "Description is too long").optional().or(z.literal("")),
  product_version_id: z.string().optional().or(z.literal("")),
  status: z.enum(PROJECT_STATUSES).default("planned"),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema.partial();
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiClient.get<Project[]>("/api/v1/projects"),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<Project>(`/api/v1/projects/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectCreateInput) => apiClient.post<Project>("/api/v1/projects", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectUpdateInput) => apiClient.put<Project>(`/api/v1/projects/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
