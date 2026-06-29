import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppLayout() {
  // The workspace (chat/terminal) page manages its own full-bleed layout
  // (the terminal card should fill the viewport, not sit inside the
  // standard page padding) -- every other page still gets the normal p-8
  // gutter.
  const pathname = useLocation().pathname;
  // Pages that manage their own full-bleed layout (terminal fills viewport,
  // database/diagram needs height-constrained flex columns, etc.)
  const isFullBleed = pathname.startsWith("/workspace") || pathname.startsWith("/database");

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <main
        className={cn(
          "flex-1 overflow-hidden",
          isFullBleed ? "flex flex-col" : "overflow-y-auto p-8"
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
