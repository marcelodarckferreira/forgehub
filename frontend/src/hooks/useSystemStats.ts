import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * System-stats domain -- backs the Dashboard's memory/disk card. See
 * backend/app/api/routes/systemstats.py.
 */

const memoryStatsSchema = z.object({
  total_bytes: z.number(),
  used_bytes: z.number(),
  available_bytes: z.number(),
  percent_used: z.number(),
});

const diskStatsSchema = z.object({
  total_bytes: z.number(),
  used_bytes: z.number(),
  free_bytes: z.number(),
  percent_used: z.number(),
});

const networkStatsSchema = z.object({
  interface: z.string().nullable(),
  rx_bytes: z.number(),
  tx_bytes: z.number(),
});

export const systemStatsSchema = z.object({
  memory: memoryStatsSchema,
  disk: diskStatsSchema,
  network: networkStatsSchema,
});
export type SystemStats = z.infer<typeof systemStatsSchema>;

const RESOURCE = "/api/v1/system-stats";

export function useSystemStats() {
  return useQuery({
    queryKey: ["system-stats"],
    queryFn: () => apiClient.get<SystemStats>(RESOURCE),
    // Live host gauge -- refetch periodically so the card stays current
    // without the user having to reload the Dashboard.
    refetchInterval: 15_000,
  });
}
