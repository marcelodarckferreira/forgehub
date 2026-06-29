import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  APPROVAL_ENTITY_TYPES,
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
      entity_type: "pipeline_stage_gate",
      entity_id: "",
      approval_type: "",
      requested_by: "",
      comments: "",
      policy_id: "",
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="entity_type">Entity type</Label>
          <Select id="entity_type" {...register("entity_type")}>
            {APPROVAL_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          {errors.entity_type && (
            <p className="text-sm text-destructive">{errors.entity_type.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="entity_id">Entity ID</Label>
          <Input
            id="entity_id"
            placeholder="uuid of the gate, release, skill, etc."
            {...register("entity_id")}
          />
          {errors.entity_id && (
            <p className="text-sm text-destructive">{errors.entity_id.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="approval_type">Approval type</Label>
          <Input
            id="approval_type"
            placeholder="e.g. gate_approval, release_approval, security_review"
            {...register("approval_type")}
          />
          {errors.approval_type && (
            <p className="text-sm text-destructive">{errors.approval_type.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="requested_by">Requested by</Label>
          <Input id="requested_by" placeholder="agent or user id" {...register("requested_by")} />
          {errors.requested_by && (
            <p className="text-sm text-destructive">{errors.requested_by.message}</p>
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
        <Label htmlFor="comments">Comments</Label>
        <Textarea
          id="comments"
          placeholder="Rationale for the request, conditions, or context"
          {...register("comments")}
        />
        {errors.comments && (
          <p className="text-sm text-destructive">{errors.comments.message}</p>
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
