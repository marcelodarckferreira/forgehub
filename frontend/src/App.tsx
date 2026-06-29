import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import WorkspacePage from "@/pages/workspace";
import ProductPage from "@/pages/product";
import ProductDetail from "@/pages/product/ProductDetail";
import ProjectPage from "@/pages/project";
import ProjectDetailPage from "@/pages/project/[id]";
import PipelinePage from "@/pages/pipeline";
import PipelineDetailPage from "@/pages/pipeline/[id]";
import BacklogPage from "@/pages/backlog";
import PlanningItemDetailPage from "@/pages/backlog/[id]";
import TaskPage from "@/pages/task";
import TaskDetailPage from "@/pages/task/[id]";
import AgentPage from "@/pages/agent";
import AgentDetailPage from "@/pages/agent/[id]";
import ArtifactPage from "@/pages/artifact";
import ArtifactDetailPage from "@/pages/artifact/[id]";
import GovernancePage from "@/pages/governance";
import ApprovalDetailPage from "@/pages/governance/[id]";
import ForgeRouterPage from "@/pages/forgerouter";
import KanboardPage from "@/pages/kanboard";
import ObsidianPage from "@/pages/obsidian";
import FoundationPage from "@/pages/foundation";
import CronsPage from "@/pages/crons";
import DeployPage from "@/pages/deploy";
import DatabaseLayout from "@/pages/database/DatabaseLayout";
import DatabaseSchemaPage from "@/pages/database/SchemaPage";
import DatabaseDiagramPage from "@/pages/database/DiagramPage";
import DatabaseQueryPage from "@/pages/database/QueryPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="workspace" element={<WorkspacePage />} />

        {/* DOMAIN ROUTES -- added by wiring step
            Append one <Route path="<domain>" element={<...Page />} /> per
            domain below this line. Each domain page lives at
            src/pages/<domain>/index.tsx and is imported above. */}
        <Route path="product" element={<ProductPage />} />
        <Route path="product/:id" element={<ProductDetail />} />
        <Route path="projects" element={<ProjectPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="pipeline/:id" element={<PipelineDetailPage />} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="backlog/:id" element={<PlanningItemDetailPage />} />
        <Route path="tasks" element={<TaskPage />} />
        <Route path="tasks/:id" element={<TaskDetailPage />} />
        <Route path="agents" element={<AgentPage />} />
        <Route path="agents/:id" element={<AgentDetailPage />} />
        <Route path="artifact" element={<ArtifactPage />} />
        <Route path="artifact/:id" element={<ArtifactDetailPage />} />
        <Route path="governance" element={<GovernancePage />} />
        <Route path="governance/:id" element={<ApprovalDetailPage />} />
        <Route path="forgerouter" element={<ForgeRouterPage />} />
        <Route path="kanboard" element={<KanboardPage />} />
        <Route path="obsidian" element={<ObsidianPage />} />
        <Route path="foundation" element={<FoundationPage />} />
        <Route path="crons" element={<CronsPage />} />
        <Route path="deploy" element={<DeployPage />} />
        <Route path="database" element={<DatabaseLayout />}>
          <Route index element={<DatabaseSchemaPage />} />
          <Route path="schema" element={<DatabaseSchemaPage />} />
          <Route path="diagram" element={<DatabaseDiagramPage />} />
          <Route path="query" element={<DatabaseQueryPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
