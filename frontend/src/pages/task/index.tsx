import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
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
import { TaskForm } from "./TaskForm";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  planned: "outline",
  assigned: "secondary",
  in_progress: "default",
  blocked: "destructive",
  completed: "success",
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
  const { data: tasks, isLoading, isError, error } = useTasks();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const [showForm, setShowForm] = useState(false);

  function handleCreate(values: TaskCreateInput) {
    createTask.mutate(
      {
        ...values,
        description: values.description || undefined,
        project_id: values.project_id || undefined,
        planning_item_id: values.planning_item_id || undefined,
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
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Planned tasks and subtasks split out from planning items, assigned to agents and tracked
            through execution.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New task
        </Button>
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

      {!isLoading && !isError && tasks && tasks.length === 0 && (
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

      {!isLoading && !isError && tasks && tasks.length > 0 && (
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
                {tasks.map((task) => (
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
                          onClick={() => deleteTask.mutate(task.id)}
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
    </div>
  );
}
