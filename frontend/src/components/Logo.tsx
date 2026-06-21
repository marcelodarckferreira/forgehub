import { cn } from "@/lib/utils";

/**
 * Brand mark: an anvil (the forge — building/executing the work) struck by
 * a spark (an AI agent actively at work on it). The anvil uses currentColor
 * so it follows text color (theme aware); the spark uses a fixed amber
 * accent so it reads consistently in both light and dark mode.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      aria-hidden="true"
    >
      <path
        d="M16 22 L42 22 L54 25 L42 28 L38 28 L34 36 L44 44 L14 44 L24 36 L20 28 L16 28 Z"
        fill="currentColor"
      />
      <path
        d="M52 11 L54 16 L59 18 L54 20 L52 25 L50 20 L45 18 L50 16 Z"
        fill="#f59e0b"
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Render only the mark, no wordmark — used in collapsed layouts. */
  iconOnly?: boolean;
}

export function Logo({ className, iconOnly = false }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 overflow-hidden", className)}>
      <LogoMark className="h-7 w-7 shrink-0" />
      {!iconOnly && (
        <span className="text-lg font-semibold tracking-tight whitespace-nowrap">
          ForgeHub
        </span>
      )}
    </div>
  );
}
