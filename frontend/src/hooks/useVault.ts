import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";
import type { DocGraph } from "@/components/GraphView";

/** Browser + editor for the Obsidian vault (mounted read-write at /vault
 * in the backend container) -- see backend/app/api/routes/vault.py. */

export interface VaultNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: VaultNode[];
}

export const vaultNoteSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export type VaultNote = z.infer<typeof vaultNoteSchema>;

const RESOURCE = "/api/v1/vault";

export const vaultKeys = {
  tree: ["vault-tree"] as const,
  note: (path: string) => ["vault-note", path] as const,
};

export function useVaultTree() {
  return useQuery({
    queryKey: vaultKeys.tree,
    queryFn: () => apiClient.get<VaultNode[]>(`${RESOURCE}/tree`),
  });
}

export function useVaultNote(path: string | undefined) {
  return useQuery({
    queryKey: vaultKeys.note(path ?? ""),
    queryFn: () => apiClient.get<VaultNote>(`${RESOURCE}/note`, { params: { path } }),
    enabled: Boolean(path),
  });
}

export function useVaultGraph() {
  return useQuery({
    queryKey: ["vault-graph"],
    queryFn: () => apiClient.get<DocGraph>(`${RESOURCE}/graph`),
  });
}

export function useUpdateVaultNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      apiClient.put<VaultNote>(`${RESOURCE}/note`, { content }, { params: { path } }),
    onSuccess: (note) => {
      queryClient.setQueryData(vaultKeys.note(note.path), note);
    },
  });
}

export function useDeleteVaultNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => apiClient.delete<void>(`${RESOURCE}/note`, { params: { path } }),
    onSuccess: (_data, path) => {
      queryClient.removeQueries({ queryKey: vaultKeys.note(path) });
      queryClient.invalidateQueries({ queryKey: vaultKeys.tree });
      queryClient.invalidateQueries({ queryKey: ["vault-graph"] });
    },
  });
}
