import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const COLLAPSE_STORAGE_KEY = "forgehub-sidebar-collapsed";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  // DOMAIN NAV LINKS -- added by wiring step
  // Append one { to: "/<domain>", label: "<Label>", icon: <LucideIcon> } per
  // domain page below this line, matching the Route path added in App.tsx.
  { to: "/product", label: "Products", icon: Package },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/pipeline", label: "Pipelines", icon: GitBranch },
  { to: "/backlog", label: "Backlog", icon: ClipboardList },
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/artifact", label: "Artifacts", icon: FileBox },
  { to: "/governance", label: "Governance", icon: Gavel },
  { to: "/forgerouter", label: "ForgeRouter", icon: Route },
  { to: "/kanboard", label: "Kanboard", icon: Kanban },
  { to: "/obsidian", label: "Obsidian", icon: Gem },
  { to: "/foundation", label: "Foundation", icon: Landmark },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1"
  );

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

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
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
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
