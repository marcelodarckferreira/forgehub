"""Foundation agents routes — read vault data from filesystem.

Provides endpoints to:
- List all 8 baseline agents with their vault metadata
- Read each agent's SOUL.md
- Read each agent's sub-agents
- List skills per agent (from profile skills dir)
- Read/write agent memory (MEMORY.md)
- Read agent config (config.yaml highlights)
- Read/write any of the 6 well-known profile Markdown config files
  (SOUL.md, MEMORY.md, TOOLS.md, AGENTS.md, HEARTBEAT.md, USER.md) for
  ANY profile under /profiles, not just the 8 baseline agents -- see
  get_profile_file/update_profile_file below.
"""

import os
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/foundation", tags=["foundation"])

VAULT_DIR = Path("/vault/Agents")
PROFILES_DIR = Path("/profiles")
BASELINE_AGENTS = [
    "athos",
    "atlas",
    "mnemosyne",
    "scriba",
    "themis",
    "aegis",
    "daedalus",
    "hephaestus",
]

# Allow-list for get_profile_file/update_profile_file -- these two routes
# accept an arbitrary `filename` path segment, so it must never be used to
# read/write anything outside this fixed set.
PROFILE_MARKDOWN_FILES = (
    "SOUL.md",
    "MEMORY.md",
    "TOOLS.md",
    "AGENTS.md",
    "HEARTBEAT.md",
    "USER.md",
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SubAgentInfo(BaseModel):
    role: str
    function: str


class SkillInfo(BaseModel):
    name: str
    description: str
    category: str | None = None


class MemoryEntry(BaseModel):
    content: str


class FoundationAgentOut(BaseModel):
    profile: str
    name: str
    role: str
    layer: str
    runtime_tier: str | None = None
    mission: str | None = None
    dependencies_upstream: list[str] = []
    dependencies_downstream: list[str] = []
    sub_agents: list[SubAgentInfo] = []
    skills: list[SkillInfo] = []
    soul: str | None = None
    memory_content: str | None = None
    config_summary: dict[str, Any] | None = None


class FoundationAgentListOut(BaseModel):
    agents: list[FoundationAgentOut]


class MemoryUpdateIn(BaseModel):
    content: str


class ProfileFileOut(BaseModel):
    profile: str
    filename: str
    content: str | None = None


class ProfileFileUpdateIn(BaseModel):
    content: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_file_safe(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def _parse_vault_md(profile: str) -> dict[str, Any]:
    """Parse the vault AGENT.md for metadata."""
    vault_path = VAULT_DIR / f"{profile.upper()}.md"
    data: dict[str, Any] = {
        "profile": profile,
        "name": profile.capitalize(),
        "role": "",
        "layer": "",
        "runtime_tier": None,
        "mission": "",
        "dependencies_upstream": [],
        "dependencies_downstream": [],
    }
    content = _read_file_safe(vault_path)
    if content is None:
        return data

    # Extract fields from vault markdown
    for line in content.splitlines():
        line_stripped = line.strip()
        if line_stripped.startswith("- Role:"):
            data["role"] = line_stripped.split(":", 1)[1].strip()
        elif line_stripped.startswith("- Layer:"):
            data["layer"] = line_stripped.split(":", 1)[1].strip()
        elif line_stripped.startswith("- Runtime tier:"):
            data["runtime_tier"] = line_stripped.split(":", 1)[1].strip()
        elif line_stripped.startswith("- Nome:"):
            data["name"] = line_stripped.split(":", 1)[1].strip()

    # Extract mission section
    mission_lines = []
    in_mission = False
    for line in content.splitlines():
        if line.strip() == "## Missão":
            in_mission = True
            continue
        if in_mission:
            if line.startswith("## "):
                break
            if line.strip():
                mission_lines.append(line.strip())
    data["mission"] = " ".join(mission_lines) if mission_lines else None

    # Extract dependencies (Upstream/Downstream lines with [[AGENT]] refs)
    for line in content.splitlines():
        if line.strip().startswith("- Upstream:"):
            refs = re.findall(r"\[\[(\w+)\]\]", line)
            data["dependencies_upstream"] = refs
        elif line.strip().startswith("- Downstream:"):
            refs = re.findall(r"\[\[(\w+)\]\]", line)
            data["dependencies_downstream"] = refs

    return data


def _parse_subagents_md(profile: str) -> list[SubAgentInfo]:
    """Parse the vault SUBAGENTS.md for sub-agent list."""
    sub_path = VAULT_DIR / f"{profile.upper()}_SUBAGENTS.md"
    content = _read_file_safe(sub_path)
    if content is None:
        return []

    sub_agents: list[SubAgentInfo] = []
    # Parse markdown table rows (skip header + separator)
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("|") and not line.startswith("| Role") and not line.startswith("|-"):
            parts = [c.strip() for c in line.split("|") if c.strip()]
            if len(parts) >= 2:
                # Remove backticks from role
                role = parts[0].replace("`", "").strip()
                function = parts[1].strip()
                sub_agents.append(SubAgentInfo(role=role, function=function))
    return sub_agents


def _list_agent_skills(profile: str) -> list[SkillInfo]:
    """Scan the profile skills directory for skill metadata."""
    skills_dir = PROFILES_DIR / profile / "skills"
    if not skills_dir.is_dir():
        return []

    skills: list[SkillInfo] = []
    for category_dir in sorted(skills_dir.rglob("SKILL.md")):
        content = _read_file_safe(category_dir)
        if content is None:
            continue

        name = category_dir.parent.name
        description = ""
        category = category_dir.parent.parent.name
        if category == "skills":
            category = None

        # Parse YAML frontmatter-like description
        for line in content.splitlines():
            if line.startswith("description:"):
                desc = line.split(":", 1)[1].strip().strip('"').strip("'")
                description = desc
                break

        skills.append(SkillInfo(name=name, description=description, category=category))

    return skills


def _get_memory_path(profile: str) -> Path:
    return PROFILES_DIR / profile / "MEMORY.md"


def _get_soul_path(profile: str) -> Path:
    return PROFILES_DIR / profile / "SOUL.md"


def _get_profile_dir_or_404(profile: str) -> Path:
    """Resolve a profile directory, rejecting anything that isn't a plain
    lowercase-alphanumeric/hyphen slug (blocks path traversal via the
    `profile` path segment, e.g. "../../etc") and anything that doesn't
    exist on disk."""
    if not re.fullmatch(r"[a-z0-9-]+", profile):
        raise HTTPException(status_code=404, detail="Profile not found")
    profile_dir = PROFILES_DIR / profile
    if not profile_dir.is_dir():
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile_dir


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/agents", response_model=FoundationAgentListOut)
async def list_foundation_agents() -> FoundationAgentListOut:
    """List all 8 baseline agents with vault metadata, skills, and sub-agents."""
    agents: list[FoundationAgentOut] = []
    for profile in BASELINE_AGENTS:
        vault_data = _parse_vault_md(profile)
        sub_agents = _parse_subagents_md(profile)
        skills = _list_agent_skills(profile)
        soul_content = _read_file_safe(_get_soul_path(profile))
        memory_content = _read_file_safe(_get_memory_path(profile))

        agents.append(
            FoundationAgentOut(
                profile=profile,
                name=vault_data["name"],
                role=vault_data["role"],
                layer=vault_data["layer"],
                runtime_tier=vault_data["runtime_tier"],
                mission=vault_data["mission"],
                dependencies_upstream=vault_data["dependencies_upstream"],
                dependencies_downstream=vault_data["dependencies_downstream"],
                sub_agents=sub_agents,
                skills=skills,
                soul=soul_content,
                memory_content=memory_content,
            )
        )

    return FoundationAgentListOut(agents=agents)


@router.get("/agents/{profile}", response_model=FoundationAgentOut)
async def get_foundation_agent(profile: str) -> FoundationAgentOut:
    """Get a single Foundation agent's full data."""
    if profile.lower() not in BASELINE_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found in baseline")

    profile = profile.lower()
    vault_data = _parse_vault_md(profile)
    sub_agents = _parse_subagents_md(profile)
    skills = _list_agent_skills(profile)
    soul_content = _read_file_safe(_get_soul_path(profile))
    memory_content = _read_file_safe(_get_memory_path(profile))

    return FoundationAgentOut(
        profile=profile,
        name=vault_data["name"],
        role=vault_data["role"],
        layer=vault_data["layer"],
        runtime_tier=vault_data["runtime_tier"],
        mission=vault_data["mission"],
        dependencies_upstream=vault_data["dependencies_upstream"],
        dependencies_downstream=vault_data["dependencies_downstream"],
        sub_agents=sub_agents,
        skills=skills,
        soul=soul_content,
        memory_content=memory_content,
    )


@router.get("/agents/{profile}/soul")
async def get_agent_soul(profile: str) -> dict[str, str]:
    """Get the SOUL.md content for a given agent."""
    if profile.lower() not in BASELINE_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found in baseline")

    content = _read_file_safe(_get_soul_path(profile.lower()))
    if content is None:
        raise HTTPException(status_code=404, detail="SOUL.md not found")
    return {"profile": profile, "soul": content}


@router.put("/agents/{profile}/memory")
async def update_agent_memory(profile: str, payload: MemoryUpdateIn) -> dict[str, str]:
    """Write updated content to an agent's MEMORY.md file."""
    if profile.lower() not in BASELINE_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found in baseline")

    profile = profile.lower()
    memory_path = _get_memory_path(profile)

    try:
        memory_path.write_text(payload.content, encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write MEMORY.md: {e}")

    return {"profile": profile, "status": "updated", "path": str(memory_path)}


@router.get("/agents/{profile}/memory")
async def get_agent_memory(profile: str) -> dict[str, str | None]:
    """Read an agent's MEMORY.md content."""
    if profile.lower() not in BASELINE_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found in baseline")

    content = _read_file_safe(_get_memory_path(profile.lower()))
    return {"profile": profile, "memory": content}


@router.get("/agents/{profile}/skills")
async def get_agent_skills(profile: str) -> list[SkillInfo]:
    """List all skills for a given agent profile."""
    if profile.lower() not in BASELINE_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found in baseline")

    return _list_agent_skills(profile.lower())


@router.get("/agents/{profile}/subagents")
async def get_agent_subagents(profile: str) -> list[SubAgentInfo]:
    """List all sub-agents for a given agent profile."""
    if profile.lower() not in BASELINE_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found in baseline")

    return _parse_subagents_md(profile.lower())


# ---------------------------------------------------------------------------
# Generic profile Markdown files (any profile under /profiles, not just
# the 8 baseline agents -- used by the Agent detail page's profile-file
# tabs in ForgeHub).
# ---------------------------------------------------------------------------


@router.get("/profiles/{profile}/files/{filename}", response_model=ProfileFileOut)
async def get_profile_file(profile: str, filename: str) -> ProfileFileOut:
    """Read one of a profile's well-known Markdown config files. `filename`
    is checked against PROFILE_MARKDOWN_FILES -- this must never be used
    to read arbitrary files from a profile directory."""
    if filename not in PROFILE_MARKDOWN_FILES:
        raise HTTPException(status_code=404, detail="Unknown profile file")
    profile_dir = _get_profile_dir_or_404(profile.lower())
    content = _read_file_safe(profile_dir / filename)
    return ProfileFileOut(profile=profile.lower(), filename=filename, content=content)


@router.put("/profiles/{profile}/files/{filename}", response_model=ProfileFileOut)
async def update_profile_file(
    profile: str, filename: str, payload: ProfileFileUpdateIn
) -> ProfileFileOut:
    """Write one of a profile's well-known Markdown config files. Same
    allow-list restriction as get_profile_file."""
    if filename not in PROFILE_MARKDOWN_FILES:
        raise HTTPException(status_code=404, detail="Unknown profile file")
    profile_dir = _get_profile_dir_or_404(profile.lower())
    path = profile_dir / filename
    try:
        path.write_text(payload.content, encoding="utf-8")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to write {filename}: {e}")
    return ProfileFileOut(profile=profile.lower(), filename=filename, content=payload.content)
