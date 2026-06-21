import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePipeline, type PipelineStage } from "@/hooks/usePipeline";

const STAGE_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  pending: "outline",
  in_progress: "warning",
  blocked: "destructive",
  completed: "success",
  skipped: "secondary",
};

const PIPELINE_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  draft: "outline",
  active: "success",
  paused: "warning",
  completed: "secondary",
  archived: "destructive",
};

function StageCard({ stage, index }: { stage: PipelineStage; index: number }) {
  const artifacts = stage.required_artifacts ?? [];
  const gates = stage.gates ?? [];
  const isBlocked = stage.status === "blocked";

  return (
    <Card className={cn(isBlocked && "border-destructive/50")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {stage.order ?? index + 1}
            </span>
            <CardTitle className="text-base leading-tight">{stage.name}</CardTitle>
          </div>
          <Badge variant={STAGE_STATUS_VARIANT[stage.status] ?? "outline"}>
            {stage.status.replace("_", " ")}
          </Badge>
        </div>
        {stage.stage_type && (
          <CardDescription className="capitalize">
            {stage.stage_type.replace(/_/g, " ")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {(stage.requires_approval || stage.requires_verification) && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {stage.requires_approval && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                <Lock className="h-3 w-3" />
                Requires approval
              </span>
            )}
            {stage.requires_verification && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                <ShieldCheck className="h-3 w-3" />
                Requires verification
              </span>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Required artifacts
          </p>
          {artifacts.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">None defined</p>
          ) : (
            <ul className="space-y-1.5">
              {artifacts.map((artifact) => (
                <li key={artifact.id} className="flex items-center gap-2 text-sm">
                  {artifact.is_satisfied ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn(!artifact.is_satisfied && "text-muted-foreground")}>
                    {artifact.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gates
          </p>
          {gates.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">None defined</p>
          ) : (
            <ul className="space-y-1.5">
              {gates.map((gate) => (
                <li key={gate.id} className="flex items-center gap-2 text-sm">
                  {gate.is_passed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn(!gate.is_passed && "text-muted-foreground")}>
                    {gate.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {stage.depends_on_stage_ids && stage.depends_on_stage_ids.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Depends on {stage.depends_on_stage_ids.length} stage
            {stage.depends_on_stage_ids.length > 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: pipeline, isLoading, isError, error } = usePipeline(id);

  const sortedStages = pipeline?.stages
    ? [...pipeline.stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  return (
    <div className="space-y-6">
      <Link
        to="/pipeline"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to pipelines
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading pipeline…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load pipeline: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && pipeline && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{pipeline.name}</h1>
              <p className="mt-1 text-muted-foreground">Project: {pipeline.project_id}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge
                variant={PIPELINE_STATUS_VARIANT[pipeline.status] ?? "outline"}
                className="text-sm capitalize"
              >
                {pipeline.status.replace("_", " ")}
              </Badge>
              {pipeline.is_active && <Badge variant="success">Active pipeline</Badge>}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Stages</CardTitle>
              <CardDescription>
                Stages execute in order. A stage cannot complete until its required artifacts
                exist and its gates pass; blocked stages prevent dependent stages from advancing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sortedStages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stages defined for this pipeline yet.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedStages.map((stage, index) => (
                    <StageCard key={stage.id} stage={stage} index={index} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <Link to="/pipeline" className={buttonVariants({ variant: "outline" })}>
              Back to list
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
