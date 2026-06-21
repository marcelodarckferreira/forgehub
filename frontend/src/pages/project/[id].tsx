import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, CalendarRange, ClipboardList, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/hooks/useProject";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError, error } = useProject(id);

  return (
    <div className="space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading project…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load project: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && project && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="mt-1 max-w-2xl text-muted-foreground">{project.description}</p>
              )}
            </div>
            <Badge variant="outline" className="text-sm capitalize">
              {project.status.replace("_", " ")}
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ClipboardList className="h-5 w-5" />
                  Project plan
                </CardTitle>
                <CardDescription>Scope, schedule, and baseline state.</CardDescription>
              </CardHeader>
              <CardContent>
                {project.plan ? (
                  <dl className="space-y-3 text-sm">
                    {project.plan.scope_summary && (
                      <div>
                        <dt className="font-medium text-muted-foreground">Scope</dt>
                        <dd>{project.plan.scope_summary}</dd>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarRange className="h-4 w-4" />
                      <span>
                        {project.plan.start_date ?? "No start date"} →{" "}
                        {project.plan.target_date ?? "No target date"}
                      </span>
                    </div>
                    {project.plan.estimated_cost != null && (
                      <div>
                        <dt className="font-medium text-muted-foreground">Estimated cost</dt>
                        <dd>{project.plan.estimated_cost}</dd>
                      </div>
                    )}
                    <div>
                      <Badge variant={project.plan.is_baselined ? "success" : "outline"}>
                        {project.plan.is_baselined ? "Baselined" : "Not baselined"}
                      </Badge>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No plan has been created for this project yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Product version</CardTitle>
                <CardDescription>The target version this project delivers against.</CardDescription>
              </CardHeader>
              <CardContent>
                {project.product_version_id ? (
                  <p className="text-sm">{project.product_version_id}</p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No product version linked.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Change requests</CardTitle>
              <CardDescription>
                Post-baseline deviations tracked against scope, time, and cost.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Change request management is available once a baseline exists for this project.
              </p>
            </CardContent>
          </Card>

          <div>
            <Link to="/projects" className={buttonVariants({ variant: "outline" })}>
              Back to list
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
