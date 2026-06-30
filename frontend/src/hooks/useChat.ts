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

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_start"; toolId: string; name: string; context?: string }
  | { type: "tool_complete"; toolId: string; name: string; summary?: string }
  | { type: "approval_request"; streamId: string; command?: string; description?: string }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

function parseChatStreamLine(raw: string): ChatStreamEvent | null {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data.error) return { type: "error", message: String(data.error) };
  if (data.done) return { type: "done", reply: data.reply ?? "" };
  if (data.tool_start) {
    return {
      type: "tool_start",
      toolId: data.tool_start.tool_id,
      name: data.tool_start.name,
      context: data.tool_start.context,
    };
  }
  if (data.tool_complete) {
    return {
      type: "tool_complete",
      toolId: data.tool_complete.tool_id,
      name: data.tool_complete.name,
      summary: data.tool_complete.summary,
    };
  }
  if (data.approval_request) {
    return {
      type: "approval_request",
      streamId: data.approval_request.stream_id,
      command: data.approval_request.command,
      description: data.approval_request.description,
    };
  }
  if (typeof data.delta === "string") return { type: "delta", text: data.delta };
  return null;
}

/** Text-mode streaming send -- hits the SSE subprocess path (full tool-calling),
 * unlike useSendChatMessage's one-shot POST. No file-upload support (GET-only). */
export function useStreamChatMessage(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return async function streamMessage(
    sessionId: string,
    message: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const token = localStorage.getItem("access_token") ?? "";
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
    const url = `${apiBase}${RESOURCE}/sessions/${sessionId}/messages/stream?message=${encodeURIComponent(message)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const event = parseChatStreamLine(line.slice(5).trim());
          if (!event) continue;
          onEvent(event);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") {
            queryClient.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
            queryClient.invalidateQueries({ queryKey: chatKeys.sessions(agentId) });
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };
}

export function useApproveChat() {
  return useMutation({
    mutationFn: ({ streamId, choice }: { streamId: string; choice: "approve" | "deny" }) =>
      apiClient.post<{ status: string }>(`${RESOURCE}/approve`, { stream_id: streamId, choice }),
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
