import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Folder, FolderOpen, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useBrowseDirs } from "@/hooks/useTerminalBrowse";

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/** Folder picker for the chat page's terminal/CLI-launcher working
 * directory -- browses the real host filesystem through the chat bridge
 * (see useTerminalBrowse + backend/app/api/routes/terminal.py). Shown as
 * a pill (not just an icon) so the active working directory stays
 * visible at a glance, with its own "x" to clear without opening the
 * popover -- mirrors the attached-file chip in the composer. */
export function WorkingDirPicker({
  workingDir,
  onSelect,
}: {
  workingDir: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  useEffect(() => {
    if (open) setBrowsePath(workingDir);
  }, [open, workingDir]);

  const { data, isLoading, isError } = useBrowseDirs(browsePath, open);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <div
        className={cn(
          "flex h-7 items-center gap-1 rounded-full px-2 text-xs",
          workingDir ? "bg-muted text-foreground" : "text-muted-foreground"
        )}
      >
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-foreground"
          title={workingDir ? `Working directory: ${workingDir}` : "Select working directory"}
          aria-label="Select working directory"
          onClick={() => setOpen((v) => !v)}
        >
          {workingDir ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
          <span className="max-w-[8rem] truncate">{workingDir ? basename(workingDir) : "Folder"}</span>
        </button>
        {workingDir && (
          <button
            type="button"
            aria-label="Clear working directory"
            title="Clear working directory"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onSelect(undefined)}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-md border border-border bg-card shadow-md">
          <div className="flex items-center gap-1 border-b border-border p-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              title="Up one level"
              aria-label="Up one level"
              disabled={!data?.parent}
              onClick={() => data?.parent && setBrowsePath(data.parent)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <span className="truncate text-xs text-muted-foreground">{data?.path ?? "…"}</span>
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {isLoading && (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            )}
            {isError && <p className="p-3 text-xs text-destructive">Failed to list directory.</p>}
            {data?.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => setBrowsePath(entry.path)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Folder className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
            {data && data.entries.length === 0 && (
              <p className="p-3 text-xs italic text-muted-foreground">No subfolders here.</p>
            )}
          </div>

          <div className="flex items-center justify-end border-t border-border p-2">
            <Button
              size="sm"
              className="h-7"
              disabled={!data?.path}
              onClick={() => {
                if (data?.path) onSelect(data.path);
                setOpen(false);
              }}
            >
              <Check className="mr-2 h-3.5 w-3.5" />
              Use this folder
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
