import { Link } from "react-router-dom";
import { useTask } from "@/hooks/useTask";
import { useArtifact } from "@/hooks/useArtifact";

/**
 * Resolves a governance polymorphic (entity_type, entity_id) reference --
 * Approval/AuditEvent target many different tables with no real FK (see
 * db/models/governance.py) -- into a human label and, where a detail page
 * exists for that entity_type, a clickable link. Entity types with no
 * dedicated detail page yet (release, pipeline_stage, pipeline_stage_gate,
 * task_execution) fall back to a plain formatted label instead of a dead
 * link.
 */
const ENTITY_ROUTES: Record<string, string> = {
  project_task: "/tasks",
  artifact: "/artifact",
  approval: "/governance",
};

function TaskRef({ id }: { id: string }) {
  const { data } = useTask(id);
  return <>{data?.title ?? id}</>;
}

function ArtifactRef({ id }: { id: string }) {
  const { data } = useArtifact(id);
  return <>{data?.name ?? id}</>;
}

export function EntityRef({ entityType, entityId }: { entityType: string; entityId: string }) {
  const route = ENTITY_ROUTES[entityType];
  const label =
    entityType === "project_task" ? (
      <TaskRef id={entityId} />
    ) : entityType === "artifact" ? (
      <ArtifactRef id={entityId} />
    ) : (
      entityId
    );

  if (!route) {
    return (
      <span className="text-muted-foreground" title={entityId}>
        {label}
      </span>
    );
  }

  return (
    <Link to={`${route}/${entityId}`} className="hover:underline">
      {label}
    </Link>
  );
}
