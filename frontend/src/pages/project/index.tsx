import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, FolderKanban, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  type ProjectCreateInput,
} from "@/hooks/useProject";
import { ProjectForm } from "./ProjectForm";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  planned: "outline",
  active: "success",
  on_hold: "warning",
  completed: "secondary",
  cancelled: "destructive",
};

export default function ProjectPage() {
  const { data: projects, isLoading, isError, error } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const [showForm, setShowForm] = useState(false);

  function handleCreate(values: ProjectCreateInput) {
    createProject.mutate(
      {
        ...values,
        description: values.description || undefined,
        product_version_id: values.product_version_id || undefined,
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
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Bounded initiatives linked to a product version, with scope, plan, and baseline.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
            <CardDescription>
              Register a new project. You can attach a plan and baseline afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              isSubmitting={createProject.isPending}
            />
            {createProject.isError && (
              <p className="mt-3 text-sm text-destructive">
                Failed to create project: {(createProject.error as Error)?.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading projects…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load projects: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && projects && projects.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first project to start planning scope and tasks.
              </p>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New project
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && projects && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg leading-tight">{project.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[project.status] ?? "outline"}>
                    {project.status.replace("_", " ")}
                  </Badge>
                </div>
                {project.description && (
                  <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 text-sm text-muted-foreground">
                {project.product_version_id ? (
                  <p>Version: {project.product_version_id}</p>
                ) : (
                  <p className="italic">No product version linked</p>
                )}
              </CardContent>
              <CardFooter className="flex justify-between gap-2">
                <Link
                  to={`/projects/${project.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  View details
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteProject.mutate(project.id)}
                  disabled={deleteProject.isPending}
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
