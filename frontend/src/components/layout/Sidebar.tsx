import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  LayoutPanelLeft,
  Package,
  FolderKanban,
  GitBranch,
  ClipboardList,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const COLLAPSE_STORAGE_KEY = "forgehub-sidebar-collapsed";
const GROUP_COLLAPSE_STORAGE_KEY = "forgehub-sidebar-group-collapsed";

interface NavLinkEntry {
  type: "link";
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroupEntry {
  type: "group";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Omit<NavLinkEntry, "type">[];
}

type NavEntry = NavLinkEntry | NavGroupEntry;

const navEntries: NavEntry[] = [
  { type: "link", to: "/", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", to: "/workspace", label: "Workspace", icon: LayoutPanelLeft },
  // DOMAIN NAV LINKS -- added by wiring step
  // Append one { type: "link", to: "/<domain>", label: "<Label>", icon: <LucideIcon> }
  // per domain page below this line, matching the Route path added in App.tsx.
  {
    type: "group",
    label: "Project Delivery",
    icon: FolderKanban,
    items: [
      { to: "/product", label: "Products", icon: Package },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/pipeline", label: "Pipelines", icon: GitBranch },
      { to: "/backlog", label: "Planning", icon: ClipboardList },
      { to: "/tasks", label: "Execution", icon: ClipboardList },
      { to: "/artifact", label: "Artifacts", icon: FileBox },
      { to: "/governance", label: "Governance", icon: Gavel },
    ],
  },
  { type: "link", to: "/agents", label: "Agents", icon: Bot },
  { type: "link", to: "/forgerouter", label: "ForgeRouter", icon: Route },
  { type: "link", to: "/kanboard", label: "Kanboard", icon: Kanban },
  { type: "link", to: "/obsidian", label: "Knowledge Base", icon: Gem },
  { type: "link", to: "/foundation", label: "Foundation", icon: Landmark },
  { type: "link", to: "/crons", label: "Crons", icon: Clock },
  { type: "link", to: "/deploy", label: "Deploy Control", icon: Server },
  {
    type: "group",
    label: "Database",
    icon: Database,
    items: [
      { to: "/database/schema", label: "Schema", icon: LayoutList },
      { to: "/database/diagram", label: "Diagram", icon: Share2 },
      { to: "/database/query", label: "Query", icon: Code2 },
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

export function Sidebar() {
  const location = useLocation();
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

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(GROUP_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const toggleGroup = (label: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

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
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navEntries.map((entry) => {
          if (entry.type === "link") {
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.to === "/"}
                title={collapsed ? entry.label : undefined}
                className={({ isActive }) => navLinkClasses(isActive, collapsed)}
              >
                <entry.icon className="h-4 w-4 shrink-0" />
                {!collapsed && entry.label}
              </NavLink>
            );
          }

          const GroupIcon = entry.icon;
          const isGroupActive = entry.items.some((item) =>
            location.pathname.startsWith(item.to)
          );
          const isGroupCollapsed = collapsedGroups[entry.label] ?? false;

          if (collapsed) {
            return entry.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) => navLinkClasses(isActive, collapsed)}
              >
                <item.icon className="h-4 w-4 shrink-0" />
              </NavLink>
            ));
          }

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
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={undefined}
                      className={({ isActive }) => navLinkClasses(isActive, false)}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-border p-3">
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
