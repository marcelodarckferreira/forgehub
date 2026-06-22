import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Feather,
  Loader2,
  MessageSquare,
  Mic,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Square,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import claudeIcon from "@lobehub/icons-static-png/dark/claude-color.png";
import codexIcon from "@lobehub/icons-static-png/dark/codex-color.png";
import antigravityIcon from "@lobehub/icons-static-png/dark/antigravity-color.png";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TerminalPane } from "@/components/TerminalPane";
import { Markdown } from "@/components/Markdown";
import { WorkingDirPicker } from "@/components/WorkingDirPicker";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAgents, type Agent } from "@/hooks/useAgent";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  useChatMessages,
  useChatSessions,
  useCreateChatSession,
  useDeleteChatSession,
  useUpdateChatSession,
  useSendChatMessage,
  useTranscribeAudio,
  type ChatMessage,
  type ChatSession,
} from "@/hooks/useChat";

const HISTORY_COLLAPSE_STORAGE_KEY = "forgehub-chat-history-collapsed";
// Tabs/active-tab are persisted (not just in-memory state) so that
// navigating to another page and back to Chat recreates the same tabs with
// the same ids -- TerminalPane then reconnects using those ids as its tmux
// session name, re-attaching to the still-running session instead of
// losing it. See TerminalPane.tsx and host-bridge/app.py's terminal_ws.
const TERMINAL_TABS_STORAGE_KEY = "forgehub-chat-terminal-tabs";
const ACTIVE_TAB_STORAGE_KEY = "forgehub-chat-active-tab";

interface TerminalTab {
  id: string;
  label: string;
  command?: string;
  cwd?: string;
}

const CLI_LAUNCHERS: { label: string; command: string; icon?: string }[] = [
  { label: "Hermes", command: "hermes" },
  { label: "Claude", command: "claude", icon: claudeIcon },
  { label: "Codex", command: "codex", icon: codexIcon },
  { label: "Antigravity", command: "agy", icon: antigravityIcon },
];

function AgentPickerButton({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: Agent[];
  selectedAgentId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = agents.find((a) => a.id === selectedAgentId);

  useClickOutside(containerRef, () => setOpen(false), open);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={selected ? `Agent: ${selected.name}` : "Select agent"}
        title={selected?.name ?? "Select agent"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bot className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onSelect(a.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                a.id === selectedAgentId && "bg-accent text-accent-foreground"
              )}
            >
              <Bot className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Per-chat-item "..." menu: rename / pin / delete. Replaces the lone
 * hover-only trash icon so the row doesn't get cluttered with separate
 * icons per action. */
function ChatItemMenu({
  session,
  onRename,
  onTogglePin,
  onDelete,
}: {
  session: ChatSession;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        aria-label="Chat options"
        title="Chat options"
        className="rounded-md p-1 opacity-0 hover:bg-accent group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-md border border-border bg-card py-1 shadow-md">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRename();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onTogglePin();
            }}
          >
            {session.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {session.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/** Gemini-style "model picker" pill, repurposed to pick the agent -- sits
 * inside the composer bar, right before the mic button. */
function AgentSelectorPill({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: Agent[];
  selectedAgentId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = agents.find((a) => a.id === selectedAgentId);

  useClickOutside(containerRef, () => setOpen(false), open);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full bg-background px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        <span className="max-w-[8rem] truncate">{selected?.name ?? "Agent"}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-10 mb-2 max-h-72 w-60 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onSelect(a.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", a.id !== selectedAgentId && "opacity-0")} />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Gemini-style "+" attachment menu -- only one action applies in our
 * scope (no Drive/image/video generation), but kept as a menu since
 * that's the requested look. */
function AttachMenuButton({ onPickFile }: { onPickFile: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full"
        aria-label="Add attachment"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-2 w-52 rounded-md border border-border bg-card py-1 shadow-md">
          <button
            type="button"
            onClick={() => {
              onPickFile();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Paperclip className="h-4 w-4" />
            Enviar arquivo
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        {message.attachment_names && (
          <p className={cn("mb-1 text-xs", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
            📎 {message.attachment_names}
          </p>
        )}
        <Markdown content={message.content} />
        <p className={cn("mt-1 text-[10px]", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { data: allAgents } = useAgents();
  const chatableAgents = useMemo(
    () => (allAgents ?? []).filter((a) => Boolean(a.profile_slug)),
    [allAgents]
  );

  const [agentId, setAgentId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [composerText, setComposerText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<{ content: string; attachmentName: string | null } | null>(
    null
  );
  const [historyCollapsed, setHistoryCollapsed] = useState(
    () => localStorage.getItem(HISTORY_COLLAPSE_STORAGE_KEY) === "1"
  );
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(() => {
    try {
      const raw = localStorage.getItem(TERMINAL_TABS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as TerminalTab[]) : [];
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) ?? "chat"
  );
  const [workingDir, setWorkingDir] = useState<string | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem(HISTORY_COLLAPSE_STORAGE_KEY, historyCollapsed ? "1" : "0");
  }, [historyCollapsed]);

  useEffect(() => {
    localStorage.setItem(TERMINAL_TABS_STORAGE_KEY, JSON.stringify(terminalTabs));
  }, [terminalTabs]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  function openTerminalTab(label: string, command?: string) {
    const id = crypto.randomUUID();
    setTerminalTabs((tabs) => [...tabs, { id, label, command, cwd: workingDir }]);
    setActiveTab(id);
  }

  function closeTerminalTab(id: string) {
    setTerminalTabs((tabs) => tabs.filter((t) => t.id !== id));
    setActiveTab((current) => (current === id ? "chat" : current));
    // Fire-and-forget: this is the one place a tab's session should
    // actually end, as opposed to every other disconnect (tab switch,
    // navigating away), which only detaches and leaves it running.
    apiClient.post(`/api/v1/terminal/sessions/${id}/kill`).catch(() => {});
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agentId && chatableAgents.length > 0) {
      setAgentId(chatableAgents[0].id);
    }
  }, [agentId, chatableAgents]);

  const { data: sessions } = useChatSessions(agentId || undefined);

  useEffect(() => {
    setSessionId("");
  }, [agentId]);

  useEffect(() => {
    if (!sessionId && sessions && sessions.length > 0) {
      setSessionId(sessions[0].id);
    }
  }, [sessionId, sessions]);

  const { data: messages } = useChatMessages(sessionId || undefined);
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession(agentId || undefined);
  const updateSession = useUpdateChatSession(agentId || undefined);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  function handleStartRename(s: ChatSession) {
    setEditingSessionId(s.id);
    setEditingTitle(s.title);
  }

  function handleCommitRename() {
    if (!editingSessionId) return;
    const title = editingTitle.trim();
    if (title) {
      updateSession.mutate({ sessionId: editingSessionId, title });
    }
    setEditingSessionId(null);
  }

  function handleTogglePin(s: ChatSession) {
    updateSession.mutate({ sessionId: s.id, pinned: !s.pinned });
  }

  const sendMessage = useSendChatMessage(agentId || undefined);
  const transcribe = useTranscribeAudio();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingMessage]);

  const selectedAgent = chatableAgents.find((a) => a.id === agentId);

  function handleNewChat() {
    if (!agentId) return;
    createSession.mutate({ agent_id: agentId }, { onSuccess: (session) => setSessionId(session.id) });
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setAttachedFile(file ?? null);
    e.target.value = "";
  }

  async function handleSend() {
    if (!agentId || (!composerText.trim() && !attachedFile) || sendMessage.isPending) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const created = await createSession.mutateAsync({ agent_id: agentId });
      activeSessionId = created.id;
      setSessionId(activeSessionId);
    }

    const message = composerText;
    const file = attachedFile;
    setComposerText("");
    setAttachedFile(null);
    setPendingMessage({ content: message, attachmentName: file?.name ?? null });

    sendMessage.mutate(
      { sessionId: activeSessionId, message, file },
      { onSettled: () => setPendingMessage(null) }
    );
  }

  const attachedImagePreviewUrl = useMemo(
    () => (attachedFile?.type.startsWith("image/") ? URL.createObjectURL(attachedFile) : null),
    [attachedFile]
  );

  useEffect(() => {
    return () => {
      if (attachedImagePreviewUrl) URL.revokeObjectURL(attachedImagePreviewUrl);
    };
  }, [attachedImagePreviewUrl]);

  function handleComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(e.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    const ext = file.type.split("/")[1] || "png";
    setAttachedFile(
      new File([file], file.name && file.name !== "image.png" ? file.name : `pasted-image.${ext}`, {
        type: file.type,
      })
    );
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleToggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const result = await transcribe.mutateAsync(blob);
      setComposerText((prev) => (prev ? `${prev} ${result.text}` : result.text));
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  if (chatableAgents.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-center text-muted-foreground">
        <div>
          <Bot className="mx-auto mb-3 h-10 w-10" />
          <p>No agents with a Hermes profile are available to chat with yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-4">
      {!historyCollapsed && (
        <aside className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-sm font-medium text-muted-foreground">Chats</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" title="New chat" aria-label="New chat" onClick={handleNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
              <AgentPickerButton agents={chatableAgents} selectedAgentId={agentId} onSelect={setAgentId} />
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {(sessions ?? []).map((s) => (
              <div
                key={s.id}
                className={cn(
                  "group flex items-center justify-between gap-1 rounded-md px-2 py-2 text-sm",
                  s.id === sessionId
                    ? "bg-accent text-accent-foreground"
                    : "cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                onClick={() => editingSessionId !== s.id && setSessionId(s.id)}
              >
                {editingSessionId === s.id ? (
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={handleCommitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCommitRename();
                      if (e.key === "Escape") setEditingSessionId(null);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                    {s.pinned && <Pin className="h-3 w-3 shrink-0 opacity-70" />}
                    <span className="truncate">{s.title}</span>
                  </span>
                )}
                {editingSessionId !== s.id && (
                  <ChatItemMenu
                    session={s}
                    onRename={() => handleStartRename(s)}
                    onTogglePin={() => handleTogglePin(s)}
                    onDelete={() =>
                      deleteSession.mutate(s.id, {
                        onSuccess: () => {
                          if (s.id === sessionId) setSessionId("");
                        },
                      })
                    }
                  />
                )}
              </div>
            ))}
            {(sessions ?? []).length === 0 && (
              <p className="px-2 py-2 text-xs italic text-muted-foreground">No chats yet.</p>
            )}
          </div>
        </aside>
      )}

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={historyCollapsed ? "Show chat history" : "Hide chat history"}
            onClick={() => setHistoryCollapsed((v) => !v)}
          >
            {historyCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>

          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-sm",
                activeTab === "chat"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </button>
            {terminalTabs.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-sm",
                  activeTab === t.id
                    ? "bg-accent text-accent-foreground"
                    : "cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <SquareTerminal className="h-3.5 w-3.5" />
                {t.label}
                <button
                  type="button"
                  aria-label={`Close ${t.label}`}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminalTab(t.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="New terminal"
              aria-label="New terminal"
              onClick={() => openTerminalTab("bash")}
            >
              <SquareTerminal className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <WorkingDirPicker workingDir={workingDir} onSelect={setWorkingDir} />
            <div className="mx-1 h-5 w-px bg-border" />
            {CLI_LAUNCHERS.map((l) => (
              <Button
                key={l.command}
                variant="outline"
                size="icon"
                className="h-7 w-7"
                title={l.label}
                aria-label={`Open ${l.label}`}
                onClick={() => openTerminalTab(l.label, l.command)}
              >
                {l.icon ? (
                  <img src={l.icon} alt="" className="h-4 w-4" />
                ) : (
                  <Feather className="h-4 w-4" />
                )}
              </Button>
            ))}
          </div>
        </div>

        <div className="relative flex-1">
          <div className={cn("absolute inset-0 flex flex-col", activeTab !== "chat" && "hidden")}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{selectedAgent?.name ?? "Select an agent"}</span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {(messages ?? []).length === 0 && (
                <p className="py-12 text-center text-sm italic text-muted-foreground">
                  Send a message to start the conversation with {selectedAgent?.name}.
                </p>
              )}
              {(messages ?? []).map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {pendingMessage && (
                <MessageBubble
                  message={{
                    id: "pending-user-message",
                    session_id: sessionId,
                    role: "user",
                    content: pendingMessage.content,
                    attachment_names: pendingMessage.attachmentName,
                    created_at: new Date().toISOString(),
                  }}
                />
              )}
              {sendMessage.isPending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                </div>
              )}
              {sendMessage.isError && (
                <p className="text-center text-sm text-destructive">
                  Failed to send message: {(sendMessage.error as Error)?.message}
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="space-y-2 border-t border-border p-3">
              {attachedFile && (
                <div className="flex w-fit items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                  {attachedImagePreviewUrl ? (
                    <img src={attachedImagePreviewUrl} alt="" className="h-6 w-6 rounded object-cover" />
                  ) : (
                    <Paperclip className="h-3 w-3" />
                  )}
                  {attachedFile.name}
                  <button type="button" aria-label="Remove attachment" onClick={() => setAttachedFile(null)}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-1.5">
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
                <AttachMenuButton onPickFile={() => fileInputRef.current?.click()} />
                <Textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  onPaste={handleComposerPaste}
                  placeholder={`Peça ao ${selectedAgent?.name ?? "agente"}`}
                  rows={1}
                  className="max-h-40 min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <AgentSelectorPill agents={chatableAgents} selectedAgentId={agentId} onSelect={setAgentId} />
                <Button
                  variant={isRecording ? "destructive" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-full shrink-0"
                  aria-label={isRecording ? "Stop recording" : "Record voice message"}
                  onClick={handleToggleRecording}
                  disabled={transcribe.isPending}
                >
                  {transcribe.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRecording ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {terminalTabs.map((t) => (
            <div key={t.id} className={cn("absolute inset-0 p-2", activeTab !== t.id && "hidden")}>
              <TerminalPane sessionId={t.id} command={t.command} cwd={t.cwd} active={activeTab === t.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
