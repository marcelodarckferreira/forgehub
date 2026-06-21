import { useEffect, useState } from "react";
import { Brain, FileText, Loader2, Network, Pencil, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { DocTree } from "@/components/DocTree";
import { GraphView } from "@/components/GraphView";
import { MindMapView } from "@/components/MindMapView";
import { cn } from "@/lib/utils";
import {
  useDeleteFoundationDoc,
  useFoundationDoc,
  useFoundationGraph,
  useFoundationTree,
  useUpdateFoundationDoc,
} from "@/hooks/useFoundationDocs";

export default function FoundationPage() {
  const { data: tree, isLoading: treeLoading, isError: treeError } = useFoundationTree();
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const { data: doc, isLoading: docLoading } = useFoundationDoc(selectedPath);
  const updateDoc = useUpdateFoundationDoc();
  const deleteDoc = useDeleteFoundationDoc();

  const [viewMode, setViewMode] = useState<"note" | "graph" | "mindmap">("note");
  const { data: graph, isLoading: graphLoading } = useFoundationGraph();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setIsEditing(false);
  }, [selectedPath]);

  function handleStartEdit() {
    setDraft(doc?.content ?? "");
    setIsEditing(true);
  }

  function handleSave() {
    if (!selectedPath) return;
    updateDoc.mutate(
      { path: selectedPath, content: draft },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  function handleSelectFromGraph(path: string) {
    setSelectedPath(path);
    setViewMode("note");
  }

  function handleDelete() {
    if (!selectedPath) return;
    if (!window.confirm(`Delete "${selectedPath}"? This removes the document file permanently.`)) return;
    deleteDoc.mutate(selectedPath, {
      onSuccess: () => setSelectedPath(undefined),
    });
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-2">
        {treeLoading && (
          <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Foundation…
          </div>
        )}
        {treeError && <p className="p-2 text-sm text-destructive">Failed to load Foundation docs.</p>}
        {tree && <DocTree nodes={tree} selectedPath={selectedPath} onSelectFile={setSelectedPath} />}
        {tree && tree.length === 0 && (
          <p className="p-2 text-sm italic text-muted-foreground">No markdown docs found.</p>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="truncate text-sm font-medium text-muted-foreground">
            {viewMode === "note" ? selectedPath ?? "" : viewMode === "graph" ? "Graph view" : "Mind map"}
          </span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-md bg-muted p-0.5">
              <Button
                variant={viewMode === "note" ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-7", viewMode === "note" && "shadow-sm")}
                onClick={() => setViewMode("note")}
              >
                <FileText className="mr-2 h-3.5 w-3.5" />
                Note
              </Button>
              <Button
                variant={viewMode === "mindmap" ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-7", viewMode === "mindmap" && "shadow-sm")}
                onClick={() => setViewMode("mindmap")}
                disabled={!selectedPath}
              >
                <Brain className="mr-2 h-3.5 w-3.5" />
                Mind map
              </Button>
              <Button
                variant={viewMode === "graph" ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-7", viewMode === "graph" && "shadow-sm")}
                onClick={() => setViewMode("graph")}
              >
                <Network className="mr-2 h-3.5 w-3.5" />
                Graph
              </Button>
            </div>

            {viewMode === "note" && selectedPath && (
              !isEditing ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleStartEdit} disabled={!doc}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={!doc || deleteDoc.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    {deleteDoc.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                    )}
                    Delete
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={updateDoc.isPending}>
                    <X className="mr-2 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateDoc.isPending}>
                    {updateDoc.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              )
            )}
          </div>
        </div>

        {viewMode === "note" && (
          <div className="flex-1 overflow-y-auto p-6">
            {!selectedPath && (
              <p className="text-sm italic text-muted-foreground">Select a document to read the Hermes rules.</p>
            )}
            {selectedPath && docLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading document…
              </div>
            )}
            {updateDoc.isError && (
              <p className="mb-3 text-sm text-destructive">
                Failed to save: {(updateDoc.error as Error)?.message}
              </p>
            )}
            {deleteDoc.isError && (
              <p className="mb-3 text-sm text-destructive">
                Failed to delete: {(deleteDoc.error as Error)?.message}
              </p>
            )}
            {doc && isEditing && (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-full min-h-[60vh] resize-none font-mono text-sm"
              />
            )}
            {doc && !isEditing && <Markdown content={doc.content} className="text-sm" />}
          </div>
        )}

        {viewMode === "graph" && (
          <div className="flex-1 overflow-hidden">
            {graphLoading && (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building graph…
              </div>
            )}
            {graph && <GraphView graph={graph} onSelectNode={handleSelectFromGraph} />}
          </div>
        )}

        {viewMode === "mindmap" && (
          <div className="flex-1 overflow-hidden">
            {!doc && <p className="p-6 text-sm italic text-muted-foreground">Select a document first.</p>}
            {doc && <MindMapView markdown={doc.content} />}
          </div>
        )}
      </div>
    </div>
  );
}
