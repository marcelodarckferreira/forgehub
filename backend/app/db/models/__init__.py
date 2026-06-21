# domain model modules are imported here by the wiring step
from app.db.models.product import Product, ProductModule, ProductVersion, Release  # noqa: F401
from app.db.models.project import Project, ProjectPlan, PlanBaseline, ChangeRequest  # noqa: F401
from app.db.models.pipeline import (  # noqa: F401
    PipelineTemplate,
    PipelineTemplateStage,
    PipelineTemplateRequiredArtifact,
    ProjectPipeline,
    PipelineStage,
    PipelineStageDependency,
    PipelineStageRequiredArtifact,
    PipelineStageGate,
)
from app.db.models.backlog import (  # noqa: F401
    PlanningItem,
    FeatureRequest,
    BugReport,
    VersionScopeItem,
    TriageDecision,
)
from app.db.models.task import (  # noqa: F401
    ProjectTask,
    TaskDependency,
    TaskRequiredSkill,
    TaskAssignment,
    TaskExecution,
)
from app.db.models.agent import (  # noqa: F401
    Agent,
    SubAgent,
    Skill,
    AgentSkill,
    SubAgentSkill,
    AgentCostRate,
    AgentCapacity,
)
from app.db.models.artifact import Artifact, ArtifactVersion  # noqa: F401
from app.db.models.governance import Policy, Approval, AuditEvent  # noqa: F401
from app.db.models.chat import ChatSession, ChatMessage  # noqa: F401
