import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, History, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTask } from "@/hooks/useTask";

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

const OUTCOME_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  pending: "outline",
  in_progress: "default",
  succeeded: "success",
  failed: "destructive",
  retried: "warning",
  verified: "success",
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task, isLoading, isError, error } = useTask(id);

  return (
    <div className="space-y-6">
      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to tasks
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading task…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load task: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && task && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{task.title}</h1>
              {task.description && (
                <p className="mt-1 max-w-2xl text-muted-foreground">{task.description}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={STATUS_VARIANT[task.status] ?? "outline"} className="text-sm capitalize">
                {task.status.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className="text-sm capitalize">
                {task.priority} priority
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Project</CardTitle>
                <CardDescription>The owning project for this task.</CardDescription>
              </CardHeader>
              <CardContent>
                {task.project_id ? (
                  <p className="text-sm">{task.project_id}</p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No project linked.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Planning item</CardTitle>
                <CardDescription>The source planning item this task was split from.</CardDescription>
              </CardHeader>
              <CardContent>
                {task.planning_item_id ? (
                  <p className="text-sm">{task.planning_item_id}</p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No planning item linked.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Schedule &amp; cost</CardTitle>
                <CardDescription>Due date and estimated cost.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Due date</dt>
                    <dd>{task.due_date ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Estimated cost</dt>
                    <dd>{task.estimated_cost != null ? task.estimated_cost : "—"}</dd>
                  </div>
                  {task.parent_task_id && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Parent task</dt>
                      <dd>{task.parent_task_id}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <History className="h-5 w-5" />
                Task executions
              </CardTitle>
              <CardDescription>
                Every real execution attempt by an agent, sub-agent, human, or system. A task can have
                multiple executions (failed, retried, verified, completed).
              </CardDescription>
            </CardHeader>
            <CardContent className={task.executions && task.executions.length > 0 ? "p-0" : undefined}>
              {task.executions && task.executions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Executor</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Actual cost</TableHead>
                      <TableHead>Evidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {task.executions.map((execution) => (
                      <TableRow key={execution.id}>
                        <TableCell className="text-sm">
                          {execution.executor_type ?? "unknown"}
                          {execution.executor_id ? ` · ${execution.executor_id}` : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant={OUTCOME_VARIANT[execution.outcome] ?? "outline"}>
                            {execution.outcome.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {execution.started_at ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {execution.completed_at ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {execution.actual_cost != null ? execution.actual_cost : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {execution.evidence_url ? (
                            <a
                              href={execution.evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No executions recorded yet for this task.
                </p>
              )}
            </CardContent>
          </Card>

          <div>
            <Link to="/tasks" className={buttonVariants({ variant: "outline" })}>
              Back to list
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
