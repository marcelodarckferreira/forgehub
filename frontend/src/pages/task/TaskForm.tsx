import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskCreateSchema,
  type TaskCreateInput,
} from "@/hooks/useTask";

interface TaskFormProps {
  defaultValues?: Partial<TaskCreateInput>;
  onSubmit: (values: TaskCreateInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function TaskForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Create task",
}: TaskFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TaskCreateInput>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      title: "",
      description: "",
      project_id: "",
      planning_item_id: "",
      parent_task_id: "",
      status: "planned",
      priority: "medium",
      due_date: "",
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="Implement task assignment endpoint" {...register("title")} />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="What does this task involve, and what does done look like?"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="project_id">Project ID</Label>
          <Input id="project_id" placeholder="uuid of the owning project" {...register("project_id")} />
          {errors.project_id && (
            <p className="text-sm text-destructive">{errors.project_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="planning_item_id">Planning item ID</Label>
          <Input
            id="planning_item_id"
            placeholder="uuid of the source planning item"
            {...register("planning_item_id")}
          />
          {errors.planning_item_id && (
            <p className="text-sm text-destructive">{errors.planning_item_id.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="parent_task_id">Parent task ID</Label>
          <Input
            id="parent_task_id"
            placeholder="uuid of parent task (for subtasks)"
            {...register("parent_task_id")}
          />
          {errors.parent_task_id && (
            <p className="text-sm text-destructive">{errors.parent_task_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="due_date">Due date</Label>
          <Input id="due_date" type="date" {...register("due_date")} />
          {errors.due_date && <p className="text-sm text-destructive">{errors.due_date.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select id="status" {...register("status")}>
            {TASK_STATUSES.map((status) => (
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
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
          {errors.priority && <p className="text-sm text-destructive">{errors.priority.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="estimated_cost">Estimated cost</Label>
          <Input
            id="estimated_cost"
            type="number"
            step="0.01"
            placeholder="0.00"
            {...register("estimated_cost")}
          />
          {errors.estimated_cost && (
            <p className="text-sm text-destructive">{errors.estimated_cost.message}</p>
          )}
        </div>
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
