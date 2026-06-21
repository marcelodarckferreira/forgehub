import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  APPROVAL_STATUSES,
  APPROVAL_SUBJECT_TYPES,
  approvalCreateSchema,
  type ApprovalCreateInput,
} from "@/hooks/useGovernance";

interface ApprovalFormProps {
  defaultValues?: Partial<ApprovalCreateInput>;
  onSubmit: (values: ApprovalCreateInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function ApprovalForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Create approval",
}: ApprovalFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApprovalCreateInput>({
    resolver: zodResolver(approvalCreateSchema),
    defaultValues: {
      subject_type: "pipeline_stage_gate",
      subject_id: "",
      status: "pending",
      requested_by: "",
      approved_by: "",
      decision_notes: "",
      policy_id: "",
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="subject_type">Subject type</Label>
          <Select id="subject_type" {...register("subject_type")}>
            {APPROVAL_SUBJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          {errors.subject_type && (
            <p className="text-sm text-destructive">{errors.subject_type.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject_id">Subject ID</Label>
          <Input
            id="subject_id"
            placeholder="uuid of the gate, release, skill, etc."
            {...register("subject_id")}
          />
          {errors.subject_id && (
            <p className="text-sm text-destructive">{errors.subject_id.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select id="status" {...register("status")}>
            {APPROVAL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
          {errors.status && <p className="text-sm text-destructive">{errors.status.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="requested_by">Requested by</Label>
          <Input id="requested_by" placeholder="agent or user id" {...register("requested_by")} />
          {errors.requested_by && (
            <p className="text-sm text-destructive">{errors.requested_by.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="approved_by">Approved by</Label>
          <Input id="approved_by" placeholder="agent or user id" {...register("approved_by")} />
          {errors.approved_by && (
            <p className="text-sm text-destructive">{errors.approved_by.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="policy_id">Policy ID</Label>
        <Input
          id="policy_id"
          placeholder="uuid of the governing policy (optional)"
          {...register("policy_id")}
        />
        {errors.policy_id && (
          <p className="text-sm text-destructive">{errors.policy_id.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="decision_notes">Decision notes</Label>
        <Textarea
          id="decision_notes"
          placeholder="Rationale for the decision, conditions, or context"
          {...register("decision_notes")}
        />
        {errors.decision_notes && (
          <p className="text-sm text-destructive">{errors.decision_notes.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
