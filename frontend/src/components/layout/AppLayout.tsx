import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppLayout() {
  // The chat/terminal page manages its own full-bleed layout (the terminal
  // card should fill the viewport, not sit inside the standard page
  // padding) -- every other page still gets the normal p-8 gutter.
  const isChat = useLocation().pathname.startsWith("/chat");

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <main
        className={cn(
          "flex-1 overflow-y-auto",
          isChat ? "flex flex-col" : "p-8"
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
