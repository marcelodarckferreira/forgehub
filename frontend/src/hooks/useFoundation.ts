import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Hermes Foundation profile files (backend/app/api/routes/foundation.py).
 * Pure filesystem read/write under /profiles/<slug>/<filename> -- no DB
 * table backs this, so it lives outside the Agent domain's query keys.
 */

export const PROFILE_MARKDOWN_FILES = [
  "SOUL.md",
  "MEMORY.md",
  "TOOLS.md",
  "AGENTS.md",
  "HEARTBEAT.md",
  "USER.md",
] as const;

export type ProfileMarkdownFile = (typeof PROFILE_MARKDOWN_FILES)[number];

export const profileFileSchema = z.object({
  profile: z.string(),
  filename: z.string(),
  content: z.string().nullable(),
});

export type ProfileFile = z.infer<typeof profileFileSchema>;

const RESOURCE = "/api/v1/foundation/profiles";

export const profileFileKeys = {
  detail: (profileSlug: string, filename: string) =>
    ["foundation-profile-file", profileSlug, filename] as const,
};

export function useProfileFile(profileSlug: string | undefined, filename: ProfileMarkdownFile) {
  return useQuery({
    queryKey: profileFileKeys.detail(profileSlug ?? "", filename),
    queryFn: () => apiClient.get<ProfileFile>(`${RESOURCE}/${profileSlug}/files/${filename}`),
    enabled: Boolean(profileSlug),
  });
}

export function useUpdateProfileFile(profileSlug: string, filename: ProfileMarkdownFile) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiClient.put<ProfileFile>(`${RESOURCE}/${profileSlug}/files/${filename}`, { content }),
    onSuccess: (data) => {
      queryClient.setQueryData(profileFileKeys.detail(profileSlug, filename), data);
    },
  });
}
