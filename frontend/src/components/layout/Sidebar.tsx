import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  LayoutPanelLeft,
  Package,
  FolderKanban,
  GitBranch,
  ClipboardList,
  CheckSquare,
  Bot,
  FileBox,
  Gavel,
  Gem,
  Kanban,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Clock,
  Server,
  Database,
  LayoutList,
  Share2,
  Code2,
  ChevronDown,
  ChevronRight,
  Users,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { usePermission } from "@/hooks/usePermission";

const COLLAPSE_STORAGE_KEY = "forgehub-sidebar-collapsed";
const GROUP_COLLAPSE_STORAGE_KEY = "forgehub-sidebar-group-collapsed";

interface NavLinkEntry {
  type: "link";
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: string; // if set, check can_view; undefined = always visible
}

interface NavGroupEntry {
  type: "group";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: (Omit<NavLinkEntry, "type"> & { module?: string })[];
}

interface NavSectionEntry {
  type: "section";
  label: string;
  entries: (NavLinkEntry | NavGroupEntry)[];
}


const NAV_SECTIONS: NavSectionEntry[] = [
  {
    type: "section",
    label: "Geral",
    entries: [
      { type: "link", to: "/", label: "Dashboard", icon: LayoutDashboard },
      { type: "link", to: "/workspace", label: "Workspace", icon: LayoutPanelLeft },
    ],
  },
  {
    type: "section",
    label: "Planejamento",
    entries: [
      {
        type: "group",
        label: "Project Delivery",
        icon: FolderKanban,
        items: [
          { to: "/product", label: "Products", icon: Package, module: "product" },
          { to: "/projects", label: "Projects", icon: FolderKanban, module: "projects" },
          { to: "/pipeline", label: "Pipelines", icon: GitBranch, module: "pipeline" },
          { to: "/backlog", label: "Planning", icon: ClipboardList, module: "backlog" },
          { to: "/tasks", label: "Execution", icon: CheckSquare, module: "tasks" },
          { to: "/artifact", label: "Artifacts", icon: FileBox, module: "artifacts" },
          { to: "/governance", label: "Governance", icon: Gavel, module: "governance" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Agentes & IA",
    entries: [
      { type: "link", to: "/agents", label: "Agents", icon: Bot, module: "agents" },
      { type: "link", to: "/foundation", label: "Foundation", icon: Landmark, module: "foundation" },
      { type: "link", to: "/forgerouter", label: "ForgeRouter", icon: Route, module: "forgerouter" },
    ],
  },
  {
    type: "section",
    label: "Ferramentas",
    entries: [
      { type: "link", to: "/kanboard", label: "Kanboard", icon: Kanban, module: "kanboard" },
      { type: "link", to: "/obsidian", label: "Knowledge Base", icon: Gem, module: "obsidian" },
      {
        type: "group",
        label: "Database",
        icon: Database,
        items: [
          { to: "/database/schema", label: "Schema", icon: LayoutList, module: "database" },
          { to: "/database/diagram", label: "Diagram", icon: Share2, module: "database" },
          { to: "/database/query", label: "Query", icon: Code2, module: "database" },
        ],
      },
      { type: "link", to: "/crons", label: "Crons", icon: Clock, module: "crons" },
      { type: "link", to: "/deploy", label: "Deploy Control", icon: Server, module: "deploy" },
    ],
  },
  {
    type: "section",
    label: "Administração",
    entries: [
      { type: "link", to: "/users", label: "Usuários", icon: Users, module: "users" },
      { type: "link", to: "/profiles", label: "Perfis de Acesso", icon: ShieldCheck, module: "profiles" },
    ],
  },
];

function navLinkClasses(isActive: boolean, collapsed: boolean) {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    collapsed && "justify-center px-2",
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  );
}

function PermissionGate({ module, children }: { module?: string; children: React.ReactNode }) {
  const perm = usePermission(module ?? "__always__");
  if (module && !perm.can_view) return null;
  return <>{children}</>;
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1"
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(GROUP_COLLAPSE_STORAGE_KEY) ?? "{}");
    } catch {
      return {};
    }
  });

  const handleLogout = () => {
    clearAuth();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(GROUP_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const toggleGroup = (label: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderLink = (entry: NavLinkEntry) => (
    <PermissionGate key={entry.to} module={entry.module}>
      <NavLink
        to={entry.to}
        end={entry.to === "/"}
        title={collapsed ? entry.label : undefined}
        className={({ isActive }) => navLinkClasses(isActive, collapsed)}
      >
        <entry.icon className="h-4 w-4 shrink-0" />
        {!collapsed && entry.label}
      </NavLink>
    </PermissionGate>
  );

  const renderGroup = (entry: NavGroupEntry) => {
    const visibleItems = entry.items; // PermissionGate handles hiding inside
    if (visibleItems.length === 0) return null;

    if (collapsed) {
      return visibleItems.map((item) => (
        <PermissionGate key={item.to} module={item.module}>
          <NavLink
            to={item.to}
            title={item.label}
            className={({ isActive }) => navLinkClasses(isActive, collapsed)}
          >
            <item.icon className="h-4 w-4 shrink-0" />
          </NavLink>
        </PermissionGate>
      ));
    }

    const GroupIcon = entry.icon;
    const isGroupActive = entry.items.some((item) => location.pathname.startsWith(item.to));
    const isGroupCollapsed = collapsedGroups[entry.label] ?? false;

    return (
      <div key={entry.label}>
        <button
          type="button"
          onClick={() => toggleGroup(entry.label)}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isGroupActive
              ? "text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <GroupIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{entry.label}</span>
          {isGroupCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
        </button>
        {!isGroupCollapsed && (
          <div className="ml-3 space-y-1 border-l border-border pl-2 pt-1">
            {entry.items.map((item) => (
              <PermissionGate key={item.to} module={item.module}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => navLinkClasses(isActive, false)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              </PermissionGate>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderEntry = (entry: NavLinkEntry | NavGroupEntry): React.ReactNode => {
    if (entry.type === "link") return renderLink(entry);
    return renderGroup(entry);
  };

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "justify-between px-6"
        )}
      >
        <Logo iconOnly={collapsed} />
        {!collapsed && <ThemeToggle />}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.entries.map((entry, i) => (
                <React.Fragment key={i}>{renderEntry(entry as NavLinkEntry | NavGroupEntry)}</React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        {user && !collapsed && (
          <div className="flex items-center gap-2 rounded-md px-3 py-2 mb-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold uppercase">
              {user.username[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.username}</p>
              {user.is_admin ? (
                <p className="flex items-center gap-0.5 text-[10px] text-amber-600">
                  <ShieldCheck className="h-2.5 w-2.5" /> Admin
                </p>
              ) : null}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className={cn("w-full text-muted-foreground", !collapsed && "justify-start gap-3")}
          aria-label="Sair"
          title="Sair"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Sair"}
        </Button>
        {collapsed && (
          <div className="flex justify-center pb-1">
            <ThemeToggle />
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className={cn("w-full", !collapsed && "justify-start gap-3")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && "Collapse sidebar"}
        </Button>
      </div>
    </aside>
  );
}
