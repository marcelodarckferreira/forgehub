import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DocTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: DocTreeNode[];
}

interface DocTreeItemProps {
  node: DocTreeNode;
  depth: number;
  selectedPath: string | undefined;
  onSelectFile: (path: string) => void;
}

function DocTreeItem({ node, depth, selectedPath, onSelectFile }: DocTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.type === "dir") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          style={{ paddingLeft: `${depth * 0.9 + 0.5}rem` }}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <DocTreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelectFile={onSelectFile} />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm",
        node.path === selectedPath
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      style={{ paddingLeft: `${depth * 0.9 + 0.5 + 1.25}rem` }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{node.name.replace(/\.md$/i, "")}</span>
    </button>
  );
}

export function DocTree({
  nodes,
  selectedPath,
  onSelectFile,
}: {
  nodes: DocTreeNode[];
  selectedPath: string | undefined;
  onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <DocTreeItem key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelectFile={onSelectFile} />
      ))}
    </>
  );
}
