import { useState } from "react";
import { Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import hermesIcon from "@lobehub/icons-static-png/light/hermesagent.png";
import claudeIcon from "@lobehub/icons-static-png/dark/claude-color.png";
import codexIcon from "@lobehub/icons-static-png/dark/codex-color.png";
import antigravityIcon from "@lobehub/icons-static-png/dark/antigravity-color.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type MonitoredTool,
  useCheckToolVersions,
  useSetToolSyncSetting,
  useToolSyncSetting,
  useToolVersions,
  useUpdateTool,
} from "@/hooks/useToolVersions";

const TOOL_META: Record<MonitoredTool, { label: string; icon: string }> = {
  hermes: { label: "Hermes", icon: hermesIcon },
  claude: { label: "Claude Code", icon: claudeIcon },
  codex: { label: "Codex", icon: codexIcon },
  antigravity: { label: "Antigravity", icon: antigravityIcon },
};

const TOOL_ORDER: MonitoredTool[] = ["hermes", "claude", "codex", "antigravity"];

export function ToolVersionsCard() {
  const { data: versions, isLoading } = useToolVersions();
  const { data: syncSetting } = useToolSyncSetting();
  const checkVersions = useCheckToolVersions();
  const setSyncSetting = useSetToolSyncSetting();
  const updateTool = useUpdateTool();
  const [updatingTool, setUpdatingTool] = useState<MonitoredTool | null>(null);

  const syncEnabled = syncSetting?.enabled ?? true;

  const handleUpdate = (tool: MonitoredTool) => {
    setUpdatingTool(tool);
    updateTool.mutate(tool, { onSettled: () => setUpdatingTool(null) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>CLI Tool Versions</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Check now"
            aria-label="Check versions now"
            onClick={() => checkVersions.mutate()}
            disabled={checkVersions.isPending}
          >
            {checkVersions.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={syncEnabled ? "Disable automatic sync" : "Enable automatic sync"}
            aria-label="Toggle automatic version sync"
            onClick={() => setSyncSetting.mutate(!syncEnabled)}
            disabled={setSyncSetting.isPending}
          >
            {syncEnabled ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {(checkVersions.isError || updateTool.isError) && (
          <p className="px-2 pb-1 text-xs text-destructive">
            {checkVersions.isError
              ? "Failed to reach the host bridge -- is forgehub-chat-bridge running?"
              : "Update failed -- see backend logs for details."}
          </p>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}
        {!isLoading &&
          TOOL_ORDER.map((tool) => {
            const meta = TOOL_META[tool];
            const version = versions?.find((v) => v.tool === tool);
            return (
              <div
                key={tool}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent/50"
              >
                <div className="flex items-center gap-3">
                  <img src={meta.icon} alt="" className="h-6 w-6 rounded" />
                  <div>
                    <div className="text-sm font-medium">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {version?.installed_version ?? (version?.last_error ? "Error" : "Unknown")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {version?.update_available ? (
                    <Badge variant="warning">{version.latest_version ?? "Update available"}</Badge>
                  ) : version?.installed_version ? (
                    <Badge variant="success">Up to date</Badge>
                  ) : version?.last_error ? (
                    <Badge variant="destructive" title={version.last_error}>
                      Check failed
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not checked</Badge>
                  )}
                  {version?.update_available && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdate(tool)}
                      disabled={updatingTool === tool}
                    >
                      {updatingTool === tool ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Update"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
