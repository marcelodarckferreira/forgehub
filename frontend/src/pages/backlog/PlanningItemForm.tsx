import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  BUG_SEVERITIES,
  PLANNING_ITEM_PRIORITIES,
  PLANNING_ITEM_STATUSES,
  PLANNING_ITEM_TYPES,
  planningItemCreateSchema,
  type PlanningItemCreateInput,
} from "@/hooks/useBacklog";

interface PlanningItemFormProps {
  defaultValues?: Partial<PlanningItemCreateInput>;
  onSubmit: (values: PlanningItemCreateInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function PlanningItemForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Create planning item",
}: PlanningItemFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PlanningItemCreateInput>({
    resolver: zodResolver(planningItemCreateSchema),
    defaultValues: {
      title: "",
      description: "",
      item_type: "feature",
      status: "new",
      priority: "medium",
      product_version_id: "",
      project_id: "",
      severity: "",
      environment: "",
      detected_in_version: "",
      ...defaultValues,
    },
  });

  const itemType = watch("item_type");
  const isBugLike = itemType === "bug" || itemType === "hotfix";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="Short summary of the planning item" {...register("title")} />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Context, rationale, and any relevant detail"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="item_type">Type</Label>
          <Select id="item_type" {...register("item_type")}>
            {PLANNING_ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace("_", " ")}
              </option>
            ))}
          </Select>
          {errors.item_type && (
            <p className="text-sm text-destructive">{errors.item_type.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select id="status" {...register("status")}>
            {PLANNING_ITEM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </Select>
          {errors.status && <p className="text-sm text-destructive">{errors.status.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" {...register("priority")}>
            {PLANNING_ITEM_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
          {errors.priority && (
            <p className="text-sm text-destructive">{errors.priority.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="product_version_id">Product version ID</Label>
          <Input
            id="product_version_id"
            placeholder="uuid of target product version"
            {...register("product_version_id")}
          />
          {errors.product_version_id && (
            <p className="text-sm text-destructive">{errors.product_version_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="project_id">Project ID</Label>
          <Input id="project_id" placeholder="uuid of linked project" {...register("project_id")} />
          {errors.project_id && (
            <p className="text-sm text-destructive">{errors.project_id.message}</p>
          )}
        </div>
      </div>

      {isBugLike && (
        <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-muted-foreground">Bug details</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select id="severity" {...register("severity")}>
                <option value="">Unset</option>
                {BUG_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </Select>
              {errors.severity && (
                <p className="text-sm text-destructive">{errors.severity.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="environment">Environment</Label>
              <Input id="environment" placeholder="production, staging…" {...register("environment")} />
              {errors.environment && (
                <p className="text-sm text-destructive">{errors.environment.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="detected_in_version">Detected in version</Label>
              <Input
                id="detected_in_version"
                placeholder="e.g. 0.1.0"
                {...register("detected_in_version")}
              />
              {errors.detected_in_version && (
                <p className="text-sm text-destructive">{errors.detected_in_version.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

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
