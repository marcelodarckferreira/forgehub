import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  PIPELINE_STATUSES,
  pipelineCreateSchema,
  type PipelineCreateInput,
} from "@/hooks/usePipeline";

interface PipelineFormProps {
  defaultValues?: Partial<PipelineCreateInput>;
  onSubmit: (values: PipelineCreateInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function PipelineForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Create pipeline",
}: PipelineFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PipelineCreateInput>({
    resolver: zodResolver(pipelineCreateSchema),
    defaultValues: {
      name: "",
      project_id: "",
      pipeline_template_id: "",
      status: "draft",
      is_active: true,
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="Foundation MVP delivery pipeline" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="project_id">Project ID</Label>
        <Input id="project_id" placeholder="uuid of the owning project" {...register("project_id")} />
        {errors.project_id && (
          <p className="text-sm text-destructive">{errors.project_id.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pipeline_template_id">Template ID</Label>
          <Input
            id="pipeline_template_id"
            placeholder="uuid of pipeline template (optional)"
            {...register("pipeline_template_id")}
          />
          {errors.pipeline_template_id && (
            <p className="text-sm text-destructive">{errors.pipeline_template_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select id="status" {...register("status")}>
            {PIPELINE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </Select>
          {errors.status && <p className="text-sm text-destructive">{errors.status.message}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="is_active"
          type="checkbox"
          className="h-4 w-4 rounded border border-input"
          {...register("is_active")}
        />
        <Label htmlFor="is_active" className="!mb-0">
          Active pipeline for this project
        </Label>
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
