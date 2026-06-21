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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreatePlanningItem,
  useDeletePlanningItem,
  usePlanningItems,
  type PlanningItemCreateInput,
} from "@/hooks/useBacklog";
import { PlanningItemForm } from "./PlanningItemForm";

const PRIORITY_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  low: "secondary",
  medium: "outline",
  high: "warning",
  critical: "destructive",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  new: "outline",
  triaged: "secondary",
  scoped: "default",
  in_progress: "warning",
  blocked: "destructive",
  done: "success",
  rejected: "destructive",
};

export default function BacklogPage() {
  const { data: planningItems, isLoading, isError, error } = usePlanningItems();
  const createPlanningItem = useCreatePlanningItem();
  const deletePlanningItem = useDeletePlanningItem();
  const [showForm, setShowForm] = useState(false);

  function handleCreate(values: PlanningItemCreateInput) {
    createPlanningItem.mutate(
      {
        ...values,
        description: values.description || undefined,
        product_version_id: values.product_version_id || undefined,
        project_id: values.project_id || undefined,
        severity: values.severity || undefined,
        environment: values.environment || undefined,
        detected_in_version: values.detected_in_version || undefined,
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
          <h1 className="text-3xl font-bold tracking-tight">Backlog</h1>
          <p className="text-muted-foreground">
            Planning items entering version scope: features, bugs, hotfixes, improvements,
            technical debt, and more.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New planning item
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create planning item</CardTitle>
            <CardDescription>
              Capture a feature, bug, or other planning item before it enters triage and version
              scope.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanningItemForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              isSubmitting={createPlanningItem.isPending}
            />
            {createPlanningItem.isError && (
              <p className="mt-3 text-sm text-destructive">
                Failed to create planning item: {(createPlanningItem.error as Error)?.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading planning items…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load planning items: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && planningItems && planningItems.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No planning items yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first feature request or bug report to start building the backlog.
              </p>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New planning item
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && planningItems && planningItems.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Version scope</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planningItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        to={`/backlog/${item.id}`}
                        className="font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                      {item.description && (
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {item.item_type.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>
                        {item.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[item.priority] ?? "outline"}>
                        {item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.version_scope_items && item.version_scope_items.length > 0
                        ? `${item.version_scope_items.length} version(s)`
                        : "Unscoped"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/backlog/${item.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          View
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePlanningItem.mutate(item.id)}
                          disabled={deletePlanningItem.isPending}
                          aria-label={`Delete ${item.title}`}
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
