import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, FileText, History, Loader2, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApproval, useAuditEvents, usePolicy } from "@/hooks/useGovernance";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  withdrawn: "secondary",
};

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: approval, isLoading, isError, error } = useApproval(id);
  const { data: policy } = usePolicy(approval?.policy_id ?? undefined);
  const { data: auditEvents } = useAuditEvents();

  const relatedAuditEvents = (auditEvents ?? []).filter(
    (event) => approval && event.entity_type === "approval" && event.entity_id === approval.id
  );

  return (
    <div className="space-y-6">
      <Link
        to="/governance"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to governance
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading approval…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load approval: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && approval && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight capitalize">
                {approval.subject_type.replace(/_/g, " ")}
              </h1>
              <p className="mt-1 max-w-2xl text-muted-foreground">
                Subject ID: {approval.subject_id}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[approval.status] ?? "outline"} className="text-sm">
              {approval.status}
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShieldCheck className="h-5 w-5" />
                  Decision
                </CardTitle>
                <CardDescription>Who requested and decided this approval.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-muted-foreground">Requested by</dt>
                    <dd>{approval.requested_by ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Approved by</dt>
                    <dd>{approval.approved_by ?? "Not yet decided"}</dd>
                  </div>
                  {approval.requested_at && (
                    <div>
                      <dt className="font-medium text-muted-foreground">Requested at</dt>
                      <dd>{approval.requested_at}</dd>
                    </div>
                  )}
                  {approval.decided_at && (
                    <div>
                      <dt className="font-medium text-muted-foreground">Decided at</dt>
                      <dd>{approval.decided_at}</dd>
                    </div>
                  )}
                  {approval.decision_notes && (
                    <div>
                      <dt className="font-medium text-muted-foreground">Decision notes</dt>
                      <dd className="whitespace-pre-wrap">{approval.decision_notes}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <FileText className="h-5 w-5" />
                  Governing policy
                </CardTitle>
                <CardDescription>The policy this approval is evaluated against.</CardDescription>
              </CardHeader>
              <CardContent>
                {policy ? (
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="font-medium text-muted-foreground">Name</dt>
                      <dd>{policy.name}</dd>
                    </div>
                    {policy.description && (
                      <div>
                        <dt className="font-medium text-muted-foreground">Description</dt>
                        <dd>{policy.description}</dd>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <dt className="font-medium text-muted-foreground">Risk level</dt>
                      <dd>
                        <Badge variant="outline" className="capitalize">
                          {policy.risk_level}
                        </Badge>
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="font-medium text-muted-foreground">Active</dt>
                      <dd>
                        <Badge variant={policy.is_active ? "success" : "secondary"}>
                          {policy.is_active ? "active" : "inactive"}
                        </Badge>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {approval.policy_id
                      ? "Policy details could not be loaded."
                      : "No policy is linked to this approval."}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <History className="h-5 w-5" />
                Audit trail
              </CardTitle>
              <CardDescription>
                Audit events recorded against this approval, in chronological order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {relatedAuditEvents.length > 0 ? (
                <ul className="space-y-3 text-sm">
                  {relatedAuditEvents.map((event) => (
                    <li key={event.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">
                          {event.action.replace(/_/g, " ")}
                        </span>
                        {event.occurred_at && (
                          <span className="text-xs text-muted-foreground">
                            {event.occurred_at}
                          </span>
                        )}
                      </div>
                      {event.summary && (
                        <p className="mt-1 text-muted-foreground">{event.summary}</p>
                      )}
                      {event.actor && (
                        <p className="mt-1 text-xs text-muted-foreground">By {event.actor}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No audit events have been recorded for this approval yet.
                </p>
              )}
            </CardContent>
          </Card>

          <div>
            <Link to="/governance" className={buttonVariants({ variant: "outline" })}>
              Back to list
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
