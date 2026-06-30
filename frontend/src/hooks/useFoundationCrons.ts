import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Hermes `hermes cron` job registry (backend/app/api/routes/foundation.py
 * list_cron_jobs). Pure filesystem read of each profile's cron/jobs.json --
 * no DB table backs this, same as the rest of the Foundation router.
 */

export const cronJobSchema = z.object({
  profile: z.string(),
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  script: z.string().nullable(),
  schedule_display: z.string().nullable(),
  enabled: z.boolean(),
  state: z.string(),
  status: z.enum(["active", "paused", "disabled"]),
  next_run_at: z.string().nullable(),
  last_run_at: z.string().nullable(),
  last_status: z.string().nullable(),
  last_error: z.string().nullable(),
  deliver: z.string().nullable(),
});

export type CronJob = z.infer<typeof cronJobSchema>;

const cronJobListSchema = z.object({ jobs: z.array(cronJobSchema) });

export const cronJobKeys = {
  list: ["foundation-crons"] as const,
};

export function useFoundationCrons() {
  return useQuery({
    queryKey: cronJobKeys.list,
    queryFn: async () => {
      const data = await apiClient.get<unknown>("/api/v1/foundation/crons");
      return cronJobListSchema.parse(data).jobs;
    },
  });
}

export function useDeleteCronJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.delete(`/api/v1/foundation/crons/${jobId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cronJobKeys.list });
    },
  });
}

export interface CronJobUpdate {
  name?: string;
  description?: string;
  schedule_display?: string;
  deliver?: string;
  enabled?: boolean;
}

export function useUpdateCronJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, updates }: { jobId: string; updates: CronJobUpdate }) =>
      apiClient.put<unknown>(`/api/v1/foundation/crons/${jobId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cronJobKeys.list });
    },
  });
}
