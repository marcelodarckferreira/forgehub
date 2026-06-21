import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api";

/**
 * Chat domain -- talks to real Hermes agents (Athos, Atlas, ...) through
 * the backend's chat bridge proxy (see backend/app/api/routes/chat.py).
 * Only agents with a profile_slug (Hermes-synced) can be chatted with.
 */

export const chatMessageRoleSchema = z.enum(["user", "assistant"]);

export const chatSessionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  hermes_session_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ChatSession = z.infer<typeof chatSessionSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  role: chatMessageRoleSchema,
  content: z.string(),
  attachment_names: z.string().nullable().optional(),
  created_at: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatSendResultSchema = z.object({
  user_message: chatMessageSchema,
  assistant_message: chatMessageSchema,
  session: chatSessionSchema,
});

export type ChatSendResult = z.infer<typeof chatSendResultSchema>;

const RESOURCE = "/api/v1/chat";

export const chatKeys = {
  sessions: (agentId?: string) => ["chat-sessions", agentId ?? "all"] as const,
  messages: (sessionId: string) => ["chat-messages", sessionId] as const,
};

export function useChatSessions(agentId: string | undefined) {
  return useQuery({
    queryKey: chatKeys.sessions(agentId),
    queryFn: () =>
      apiClient.get<ChatSession[]>(`${RESOURCE}/sessions`, { params: { agent_id: agentId } }),
    enabled: Boolean(agentId),
  });
}

export function useCreateChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { agent_id: string; title?: string }) =>
      apiClient.post<ChatSession>(`${RESOURCE}/sessions`, payload),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.sessions(session.agent_id) });
    },
  });
}

export function useUpdateChatSession(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      ...payload
    }: {
      sessionId: string;
      title?: string;
      pinned?: boolean;
    }) => apiClient.patch<ChatSession>(`${RESOURCE}/sessions/${sessionId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.sessions(agentId) });
    },
  });
}

export function useDeleteChatSession(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiClient.delete<void>(`${RESOURCE}/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.sessions(agentId) });
    },
  });
}

export function useChatMessages(sessionId: string | undefined) {
  return useQuery({
    queryKey: chatKeys.messages(sessionId ?? ""),
    queryFn: () => apiClient.get<ChatMessage[]>(`${RESOURCE}/sessions/${sessionId}/messages`),
    enabled: Boolean(sessionId),
  });
}

export function useSendChatMessage(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      message,
      file,
    }: {
      sessionId: string;
      message: string;
      file?: File | null;
    }) => {
      const form = new FormData();
      form.set("message", message);
      if (file) form.set("file", file);
      return apiClient.postForm<ChatSendResult>(`${RESOURCE}/sessions/${sessionId}/messages`, form);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(result.session.id) });
      queryClient.invalidateQueries({ queryKey: chatKeys.sessions(agentId) });
    },
  });
}

export function useTranscribeAudio() {
  return useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const form = new FormData();
      form.set("audio", audioBlob, "recording.webm");
      return apiClient.postForm<{ text: string }>(`${RESOURCE}/transcribe`, form);
    },
  });
}
