import { Link } from "react-router-dom";
import { AlertCircle, Bot, CornerDownRight, Loader2, RefreshCw, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAgents, useSyncHermesAgents, type Agent, type SubAgent } from "@/hooks/useAgent";

type AgentRow =
  | { kind: "agent"; agent: Agent }
  | { kind: "sub-agent"; agent: Agent; subAgent: SubAgent };

function toRows(agents: Agent[]): AgentRow[] {
  return agents.flatMap((agent) => [
    { kind: "agent" as const, agent },
    ...(agent.sub_agents ?? []).map((subAgent) => ({
      kind: "sub-agent" as const,
      agent,
      subAgent,
    })),
  ]);
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  active: "success",
  inactive: "outline",
  retired: "destructive",
};

const TYPE_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  executor: "secondary",
  coordinator: "default",
  hybrid: "outline",
};

export default function AgentPage() {
  const { data: agents, isLoading, isError, error } = useAgents();
  const syncHermes = useSyncHermesAgents();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Executors and coordinators registered for task assignment, with their sub-agents,
            skills, cost rates, and capacities.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => syncHermes.mutate()}
          disabled={syncHermes.isPending}
        >
          {syncHermes.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync from Hermes Foundation
        </Button>
      </div>

      {syncHermes.isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-4 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Hermes sync failed: {(syncHermes.error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {syncHermes.isSuccess && syncHermes.data && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              Hermes Foundation sync result
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>
              Agents: <strong className="text-foreground">{syncHermes.data.agents.created}</strong>{" "}
              created, <strong className="text-foreground">{syncHermes.data.agents.updated}</strong>{" "}
              updated
            </span>
            <span>
              Sub-agents:{" "}
              <strong className="text-foreground">{syncHermes.data.sub_agents.created}</strong>{" "}
              created,{" "}
              <strong className="text-foreground">{syncHermes.data.sub_agents.updated}</strong>{" "}
              updated
            </span>
            <span>
              Skills: <strong className="text-foreground">{syncHermes.data.skills.created}</strong>{" "}
              created, <strong className="text-foreground">{syncHermes.data.skills.updated}</strong>{" "}
              updated
            </span>
            <span>
              Skill grants:{" "}
              <strong className="text-foreground">{syncHermes.data.agent_skills.created}</strong>{" "}
              created
            </span>
            {syncHermes.data.warnings.length > 0 && (
              <span className="text-destructive">{syncHermes.data.warnings.join("; ")}</span>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading agents…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load agents: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && agents && agents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Bot className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No agents yet</p>
              <p className="text-sm text-muted-foreground">
                Sync the Hermes Foundation roster above to register agents.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && agents && agents.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Layer / Tier</TableHead>
                  <TableHead>Sub-agents</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {toRows(agents).map((row) =>
                  row.kind === "agent" ? (
                    <TableRow key={row.agent.id}>
                      <TableCell>
                        <Link
                          to={`/agents/${row.agent.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.agent.name}
                        </Link>
                        {row.agent.profile_slug && (
                          <p className="text-xs text-muted-foreground">`{row.agent.profile_slug}`</p>
                        )}
                        {!row.agent.profile_slug && row.agent.description && (
                          <p className="max-w-xs truncate text-xs text-muted-foreground">
                            {row.agent.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TYPE_VARIANT[row.agent.agent_type] ?? "outline"}>
                          {row.agent.agent_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.agent.status] ?? "outline"}>
                          {row.agent.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.agent.layer ? (
                          <span>
                            {row.agent.layer}
                            {row.agent.runtime_tier ? ` · Tier ${row.agent.runtime_tier}` : ""}
                            {row.agent.telegram_required ? " · Telegram" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.agent.sub_agents?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`/agents/${row.agent.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={row.subAgent.id} className="bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-2 pl-6">
                          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm">{row.subAgent.name}</span>
                        </div>
                        {row.subAgent.description && (
                          <p className="max-w-xs truncate pl-9 text-xs text-muted-foreground">
                            {row.subAgent.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          sub-agent
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.subAgent.status] ?? "outline"}>
                          {row.subAgent.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">—</TableCell>
                      <TableCell className="text-sm text-muted-foreground">—</TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`/agents/${row.agent.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          View parent
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
