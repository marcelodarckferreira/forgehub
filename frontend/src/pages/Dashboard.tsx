import { ToolVersionsCard } from "@/components/ToolVersionsCard";
import { SystemStatsCard } from "@/components/SystemStatsCard";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to ForgeHub.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ToolVersionsCard />
        <SystemStatsCard />
      </div>
    </div>
  );
}
