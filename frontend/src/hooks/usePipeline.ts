import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Pipeline domain (see docs/SPEC.md 4.3 Pipeline Domain):
 *   pipeline_templates, pipeline_template_stages, pipeline_template_required_artifacts,
 *   project_pipelines, pipeline_stages, pipeline_stage_dependencies,
 *   pipeline_stage_required_artifacts, pipeline_stage_gates
 *
 * Primary entity: ProjectPipeline. Every project must have an active pipeline
 * (PRD.md 5.5 / SPEC.md 6.2). A ProjectPipeline carries a nested ordered list
 * of PipelineStage, each of which may declare required artifacts and gates
 * (human approval / independent verification) that block completion and
 * advancement of dependent stages until satisfied.
 *
 * Backend contract: /api/v1/pipelines (list/create/get/update/delete).
 */

export const PIPELINE_STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const STAGE_STATUSES = [
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "skipped",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_TYPES = [
  "discovery",
  "spec",
  "architecture_review",
  "implementation",
  "migration",
  "testing",
  "build",
  "release_notes",
  "deployment_package",
  "release_approval",
  "other",
] as const;
export type StageType = (typeof STAGE_TYPES)[number];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const stageRequiredArtifactSchema = z.object({
  id: z.string(),
  pipeline_stage_id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  is_satisfied: z.boolean().optional().default(false),
});

export type StageRequiredArtifact = z.infer<typeof stageRequiredArtifactSchema>;

export const stageGateSchema = z.object({
  id: z.string(),
  pipeline_stage_id: z.string(),
  name: z.string(),
  requires_approval: z.boolean().optional().default(false),
  requires_verification: z.boolean().optional().default(false),
  is_passed: z.boolean().optional().default(false),
});

export type StageGate = z.infer<typeof stageGateSchema>;

export const pipelineStageSchema = z.object({
  id: z.string(),
  project_pipeline_id: z.string(),
  name: z.string(),
  stage_type: z.enum(STAGE_TYPES).optional(),
  order: z.number().int().optional(),
  status: z.enum(STAGE_STATUSES).default("pending"),
  requires_approval: z.boolean().optional().default(false),
  requires_verification: z.boolean().optional().default(false),
  depends_on_stage_ids: z.array(z.string()).optional().default([]),
  required_artifacts: z.array(stageRequiredArtifactSchema).optional().default([]),
  gates: z.array(stageGateSchema).optional().default([]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const projectPipelineSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  pipeline_template_id: z.string().nullable().optional(),
  status: z.enum(PIPELINE_STATUSES).default("draft"),
  is_active: z.boolean().optional().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  stages: z.array(pipelineStageSchema).optional().default([]),
});

export type ProjectPipeline = z.infer<typeof projectPipelineSchema>;

// Payload schemas (what the create/edit form submits).
export const pipelineCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name is too long"),
  project_id: z.string().min(1, "Project is required"),
  pipeline_template_id: z.string().optional().or(z.literal("")),
  status: z.enum(PIPELINE_STATUSES).default("draft"),
  is_active: z.boolean().optional().default(true),
});

export type PipelineCreateInput = z.infer<typeof pipelineCreateSchema>;

export const pipelineUpdateSchema = pipelineCreateSchema.partial();
export type PipelineUpdateInput = z.infer<typeof pipelineUpdateSchema>;

export const pipelineTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type PipelineTemplate = z.infer<typeof pipelineTemplateSchema>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const pipelineKeys = {
  all: ["pipelines"] as const,
  detail: (id: string) => ["pipelines", id] as const,
  templates: ["pipeline-templates"] as const,
};

const RESOURCE = "/api/v1/pipelines";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePipelines() {
  return useQuery({
    queryKey: pipelineKeys.all,
    queryFn: () => apiClient.get<ProjectPipeline[]>(RESOURCE),
  });
}

export function usePipeline(id: string | undefined) {
  return useQuery({
    queryKey: pipelineKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<ProjectPipeline>(`${RESOURCE}/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PipelineCreateInput) => apiClient.post<ProjectPipeline>(RESOURCE, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });
}

export function useUpdatePipeline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PipelineUpdateInput) =>
      apiClient.patch<ProjectPipeline>(`${RESOURCE}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(id) });
    },
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`${RESOURCE}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });
}

export function usePipelineTemplates() {
  return useQuery({
    queryKey: pipelineKeys.templates,
    queryFn: () => apiClient.get<PipelineTemplate[]>(`${RESOURCE}/templates`),
  });
}

// ---------------------------------------------------------------------------
// Stage CRUD
// ---------------------------------------------------------------------------

export const stageCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  stage_type: z.enum(STAGE_TYPES),
  order_index: z.coerce.number().int().min(0),
  status: z.enum(STAGE_STATUSES).default("pending"),
  requires_approval: z.boolean().default(false),
  requires_verification: z.boolean().default(false),
});

export type StageCreateInput = z.infer<typeof stageCreateSchema>;

export function useCreateStage(pipelineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StageCreateInput) =>
      apiClient.post<PipelineStage>(`${RESOURCE}/${pipelineId}/stages`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) });
    },
  });
}

export function useUpdateStage(pipelineId: string, stageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<StageCreateInput>) =>
      apiClient.patch<PipelineStage>(`${RESOURCE}/stages/${stageId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) });
    },
  });
}

export function useDeleteStage(pipelineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      apiClient.delete<void>(`${RESOURCE}/stages/${stageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) });
    },
  });
}
