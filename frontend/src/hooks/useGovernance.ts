import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Governance domain (see docs/SPEC.md 4.8 Governance Domain / PRD.md 5.7, 6.2, 6.5):
 *   approvals, audit_events, policies
 *
 * Approval is the primary entity -- it records the outcome of a gated
 * transition (pipeline stage gate, release approval, critical skill
 * approval, etc.). AuditEvent is read-mostly: every major entity
 * transition produces one, and the UI only ever lists/reads them. Policy
 * is a governed rule (e.g. "critical skills require approval") that
 * approvals and gates are evaluated against.
 *
 * Backend contract: /api/v1/governance (list/create/get/update/delete on
 * Approval). Audit events and policies are sub-resources reachable under
 * the same governance namespace.
 */

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_SUBJECT_TYPES = [
  "pipeline_stage_gate",
  "release",
  "skill",
  "change_request",
  "artifact",
] as const;
export type ApprovalSubjectType = (typeof APPROVAL_SUBJECT_TYPES)[number];

export const AUDIT_EVENT_ACTIONS = [
  "created",
  "updated",
  "deleted",
  "approved",
  "rejected",
  "status_changed",
  "executed",
] as const;
export type AuditEventAction = (typeof AUDIT_EVENT_ACTIONS)[number];

export const POLICY_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type PolicyRiskLevel = (typeof POLICY_RISK_LEVELS)[number];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const approvalSchema = z.object({
  id: z.string(),
  subject_type: z.enum(APPROVAL_SUBJECT_TYPES),
  subject_id: z.string(),
  status: z.enum(APPROVAL_STATUSES).default("pending"),
  requested_by: z.string().nullable().optional(),
  approved_by: z.string().nullable().optional(),
  decision_notes: z.string().nullable().optional(),
  policy_id: z.string().nullable().optional(),
  requested_at: z.string().optional(),
  decided_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Approval = z.infer<typeof approvalSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  action: z.enum(AUDIT_EVENT_ACTIONS),
  actor: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  occurred_at: z.string().optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  risk_level: z.enum(POLICY_RISK_LEVELS).default("medium"),
  requires_approval: z.boolean().default(true),
  is_active: z.boolean().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Policy = z.infer<typeof policySchema>;

// Payload schema (what the create/edit form submits) for the primary entity.
export const approvalCreateSchema = z.object({
  subject_type: z.enum(APPROVAL_SUBJECT_TYPES).default("pipeline_stage_gate"),
  subject_id: z.string().min(1, "Subject ID is required").max(200, "Subject ID is too long"),
  status: z.enum(APPROVAL_STATUSES).default("pending"),
  requested_by: z.string().max(200, "Too long").optional().or(z.literal("")),
  approved_by: z.string().max(200, "Too long").optional().or(z.literal("")),
  decision_notes: z.string().max(4000, "Notes are too long").optional().or(z.literal("")),
  policy_id: z.string().optional().or(z.literal("")),
});

export type ApprovalCreateInput = z.infer<typeof approvalCreateSchema>;

export const approvalUpdateSchema = approvalCreateSchema.partial();
export type ApprovalUpdateInput = z.infer<typeof approvalUpdateSchema>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const governanceKeys = {
  all: ["governance"] as const,
  detail: (id: string) => ["governance", id] as const,
  auditEvents: ["governance-audit-events"] as const,
  policies: ["governance-policies"] as const,
};

const RESOURCE = "/api/v1/governance";

// ---------------------------------------------------------------------------
// Approval hooks (primary entity)
// ---------------------------------------------------------------------------

export function useApprovals() {
  return useQuery({
    queryKey: governanceKeys.all,
    queryFn: () => apiClient.get<Approval[]>(RESOURCE),
  });
}

export function useApproval(id: string | undefined) {
  return useQuery({
    queryKey: governanceKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<Approval>(`${RESOURCE}/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApprovalCreateInput) => apiClient.post<Approval>(RESOURCE, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceKeys.all });
    },
  });
}

export function useUpdateApproval(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApprovalUpdateInput) =>
      apiClient.put<Approval>(`${RESOURCE}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceKeys.all });
      queryClient.invalidateQueries({ queryKey: governanceKeys.detail(id) });
    },
  });
}

export function useDeleteApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`${RESOURCE}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Audit event hooks (read-mostly)
// ---------------------------------------------------------------------------

export function useAuditEvents() {
  return useQuery({
    queryKey: governanceKeys.auditEvents,
    queryFn: () => apiClient.get<AuditEvent[]>(`${RESOURCE}/audit-events`),
  });
}

export function useAuditEvent(id: string | undefined) {
  return useQuery({
    queryKey: [...governanceKeys.auditEvents, id],
    queryFn: () => apiClient.get<AuditEvent>(`${RESOURCE}/audit-events/${id}`),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Policy hooks
// ---------------------------------------------------------------------------

export function usePolicies() {
  return useQuery({
    queryKey: governanceKeys.policies,
    queryFn: () => apiClient.get<Policy[]>(`${RESOURCE}/policies`),
  });
}

export function usePolicy(id: string | undefined) {
  return useQuery({
    queryKey: [...governanceKeys.policies, id],
    queryFn: () => apiClient.get<Policy>(`${RESOURCE}/policies/${id}`),
    enabled: Boolean(id),
  });
}
