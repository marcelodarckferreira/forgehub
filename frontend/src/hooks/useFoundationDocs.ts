import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";
import type { DocGraph } from "@/components/GraphView";

/** Browser + editor for the Hermes Foundation rule docs (governance,
 * policies, agents, ...) mounted read-write at /foundation-root in the
 * backend container -- see backend/app/api/routes/foundation_docs.py. */

export interface FoundationDocNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FoundationDocNode[];
}

export const foundationDocSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export type FoundationDoc = z.infer<typeof foundationDocSchema>;

const RESOURCE = "/api/v1/foundation-docs";

export const foundationDocKeys = {
  tree: ["foundation-docs-tree"] as const,
  doc: (path: string) => ["foundation-docs-doc", path] as const,
};

export function useFoundationTree() {
  return useQuery({
    queryKey: foundationDocKeys.tree,
    queryFn: () => apiClient.get<FoundationDocNode[]>(`${RESOURCE}/tree`),
  });
}

export function useFoundationDoc(path: string | undefined) {
  return useQuery({
    queryKey: foundationDocKeys.doc(path ?? ""),
    queryFn: () => apiClient.get<FoundationDoc>(`${RESOURCE}/doc`, { params: { path } }),
    enabled: Boolean(path),
  });
}

export function useFoundationGraph() {
  return useQuery({
    queryKey: ["foundation-docs-graph"],
    queryFn: () => apiClient.get<DocGraph>(`${RESOURCE}/graph`),
  });
}

export function useUpdateFoundationDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      apiClient.put<FoundationDoc>(`${RESOURCE}/doc`, { content }, { params: { path } }),
    onSuccess: (doc) => {
      queryClient.setQueryData(foundationDocKeys.doc(doc.path), doc);
    },
  });
}

export function useDeleteFoundationDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => apiClient.delete<void>(`${RESOURCE}/doc`, { params: { path } }),
    onSuccess: (_data, path) => {
      queryClient.removeQueries({ queryKey: foundationDocKeys.doc(path) });
      queryClient.invalidateQueries({ queryKey: foundationDocKeys.tree });
      queryClient.invalidateQueries({ queryKey: ["foundation-docs-graph"] });
    },
  });
}
