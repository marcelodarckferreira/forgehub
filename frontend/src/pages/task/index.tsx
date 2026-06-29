import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ClipboardList, Filter, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  useCreateTask,
  useDeleteTask,
  useTasks,
  type TaskCreateInput,
} from "@/hooks/useTask";
import { useProjects } from "@/hooks/useProject";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TaskForm } from "./TaskForm";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  planned: "outline",
  assigned: "secondary",
  in_progress: "default",
  blocked: "destructive",
  done: "success",
  deployed: "success",
  cancelled: "destructive",
};

const PRIORITY_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  low: "outline",
  medium: "secondary",
  high: "warning",
  critical: "destructive",
};

export default function TaskPage() {
  const [searchParams] = useSearchParams();
  const prefilledCrId = searchParams.get("change_request_id") ?? undefined;
  const prefilledPlanningItemId = searchParams.get("planning_item_id") ?? undefined;
  const prefilledProjectId = searchParams.get("project_id") ?? undefined;

  const { data: tasks, isLoading, isError, error } = useTasks();
  const { data: projects } = useProjects();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const [showForm, setShowForm] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const visibleTasks = filterProjectId
    ? (tasks ?? []).filter((t) => t.project_id === filterProjectId)
    : (tasks ?? []);

  // Auto-open form when arriving with pre-filled params from a planning item or CR button.
  useEffect(() => {
    if (prefilledCrId || prefilledPlanningItemId) setShowForm(true);
  }, [prefilledCrId, prefilledPlanningItemId]);

  function handleCreate(values: TaskCreateInput) {
    createTask.mutate(
      {
        ...values,
        description: values.description || undefined,
        project_id: values.project_id || undefined,
        planning_item_id: values.planning_item_id || undefined,
        change_request_id: values.change_request_id || undefined,
        parent_task_id: values.parent_task_id || undefined,
        due_date: values.due_date || undefined,
      },
      {
        onSuccess: () => setShowForm(false),
      }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Execution</h1>
          <p className="text-muted-foreground">
            Planned tasks and subtasks split out from planning items, assigned to agents and tracked
            through execution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            New task
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create task</CardTitle>
            <CardDescription>
              Register a new task. Assignments and executions are tracked once work begins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TaskForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              isSubmitting={createTask.isPending}
              projectId={prefilledProjectId}
              defaultValues={{
                change_request_id: prefilledCrId ?? "",
                planning_item_id: prefilledPlanningItemId ?? "",
                project_id: prefilledProjectId ?? "",
              }}
            />
            {createTask.isError && (
              <p className="mt-3 text-sm text-destructive">
                Failed to create task: {(createTask.error as Error)?.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading tasks…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load tasks: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && visibleTasks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No tasks yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first task to start tracking assignment and execution.
              </p>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New task
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && visibleTasks.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Executions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link to={`/tasks/${task.id}`} className="font-medium hover:underline">
                        {task.title}
                      </Link>
                      {task.parent_task_id && (
                        <p className="text-xs text-muted-foreground">Subtask</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[task.status] ?? "outline"}>
                        {task.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[task.priority] ?? "outline"}>
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.due_date ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.executions?.length ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/tasks/${task.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          View
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDeleteId(task.id)}
                          disabled={deleteTask.isPending}
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete task?"
        description="This will permanently delete the task and all its executions. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteId) deleteTask.mutate(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
