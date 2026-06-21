import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Task domain (see docs/SPEC.md 4.5 Task Domain):
 *   project_tasks, task_dependencies, task_required_skills,
 *   task_assignments, task_executions
 *
 * Primary entity: ProjectTask. A ProjectTask represents a planned task or
 * subtask (subtasks use parent_task_id relationships) split out from a
 * PlanningItem (PRD.md 5.9). Each ProjectTask carries a nested list of
 * TaskExecution records (PRD.md 5.10) -- every real execution attempt by an
 * agent, sub-agent, human, or system is tracked separately, and a task can
 * have multiple executions (failed, retried, verified, completed) per
 * SPEC.md 5.4 / 6.4.
 *
 * Backend contract: /api/v1/tasks (list/create/get/update/delete).
 */

export const TASK_STATUSES = [
  "planned",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_EXECUTION_OUTCOMES = [
  "pending",
  "in_progress",
  "succeeded",
  "failed",
  "retried",
  "verified",
] as const;

export type TaskExecutionOutcome = (typeof TASK_EXECUTION_OUTCOMES)[number];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const taskExecutionSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  executor_type: z.string().nullable().optional(),
  executor_id: z.string().nullable().optional(),
  outcome: z.enum(TASK_EXECUTION_OUTCOMES).default("pending"),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  actual_cost: z.number().nullable().optional(),
  evidence_url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export type TaskExecution = z.infer<typeof taskExecutionSchema>;

export const taskDependencySchema = z.object({
  id: z.string(),
  task_id: z.string(),
  depends_on_task_id: z.string(),
});

export type TaskDependency = z.infer<typeof taskDependencySchema>;

export const taskRequiredSkillSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  skill_id: z.string(),
});

export type TaskRequiredSkill = z.infer<typeof taskRequiredSkillSchema>;

export const taskAssignmentSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  agent_id: z.string().nullable().optional(),
  sub_agent_id: z.string().nullable().optional(),
  assigned_at: z.string().optional(),
});

export type TaskAssignment = z.infer<typeof taskAssignmentSchema>;

export const projectTaskSchema = z.object({
  id: z.string(),
  planning_item_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  parent_task_id: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).default("planned"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  estimated_cost: z.number().nullable().optional(),
  due_date: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  executions: z.array(taskExecutionSchema).nullable().optional(),
});

export type ProjectTask = z.infer<typeof projectTaskSchema>;

// Payload schemas (what the create/edit form submits).
export const taskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  description: z.string().max(2000, "Description is too long").optional().or(z.literal("")),
  project_id: z.string().optional().or(z.literal("")),
  planning_item_id: z.string().optional().or(z.literal("")),
  parent_task_id: z.string().optional().or(z.literal("")),
  status: z.enum(TASK_STATUSES).default("planned"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  estimated_cost: z
    .union([z.coerce.number(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
  due_date: z.string().optional().or(z.literal("")),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.partial();
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const taskKeys = {
  all: ["tasks"] as const,
  detail: (id: string) => ["tasks", id] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useTasks() {
  return useQuery({
    queryKey: taskKeys.all,
    queryFn: () => apiClient.get<ProjectTask[]>("/api/v1/tasks"),
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<ProjectTask>(`/api/v1/tasks/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskCreateInput) => apiClient.post<ProjectTask>("/api/v1/tasks", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useUpdateTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskUpdateInput) => apiClient.put<ProjectTask>(`/api/v1/tasks/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
