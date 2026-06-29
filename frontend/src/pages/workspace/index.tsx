import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
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
import { motion, AnimatePresence } from "framer-motion";
import claudeIcon from "@lobehub/icons-static-png/dark/claude-color.png";
import codexIcon from "@lobehub/icons-static-png/dark/codex-color.png";
import antigravityIcon from "@lobehub/icons-static-png/dark/antigravity-color.png";
import opencodeIcon from "@lobehub/icons-static-png/light/opencode.png";
import hermesIcon from "@lobehub/icons-static-png/light/hermesagent.png";
import piIcon from "@/assets/icons/pi.svg";
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
import { useChatHandoffStore } from "@/store/chatHandoff";

// Tabs/active-tab are persisted (not just in-memory state) so that
// navigating to another page and back to Workspace recreates the same tabs
// with the same ids -- TerminalPane then reconnects using those ids as its
// tmux session name, re-attaching to the still-running session instead of
// losing it. See TerminalPane.tsx and host-bridge/app.py's terminal_ws.
const TABS_STORAGE_KEY = "forgehub-workspace-tabs";
const ACTIVE_TAB_STORAGE_KEY = "forgehub-workspace-active-tab";

// Composer auto-grow ceiling -- past this it scrolls internally instead
// of taking over the message area.
const COMPOSER_MAX_HEIGHT_PX = 240;

type WorkspaceTab =
  | { kind: "chat"; id: string; agentId: string; historyCollapsed?: boolean }
  | { kind: "terminal"; id: string; label: string; command?: string; cwd?: string };

type Launcher = { label: string; command: string; icon?: string; iconBg?: string };

// "CLI" -- AI coding-assistant CLIs you'd run ad-hoc against this checkout.
const CLI_LAUNCHERS: Launcher[] = [
  { label: "Claude", command: "claude", icon: claudeIcon },
  { label: "Codex", command: "codex", icon: codexIcon },
  { label: "Antigravity", command: "agy", icon: antigravityIcon },
  // pi's mark is a plain white glyph (no built-in background), so it needs
  // a dark backing square to read against this button's light background --
  // unlike the others above, which are already self-contained color PNGs.
  { label: "PI", command: "pi", icon: piIcon, iconBg: "bg-black" },
  { label: "Opencode", command: "opencode", icon: opencodeIcon },
];

// "Runtimes" -- agent orchestration platforms (as opposed to one-shot
// coding CLIs above). Add OpenClaw or similar here once it has a launch
// command.
const RUNTIME_LAUNCHERS: Launcher[] = [
  { label: "Hermes", command: "hermes", icon: hermesIcon },
];

function LauncherIcon({ icon, iconBg }: { icon?: string; iconBg?: string }) {
  if (!icon) return <Feather className="h-4 w-4" />;
  if (!iconBg) return <img src={icon} alt="" className="h-4 w-4" />;
  return (
    <span className={cn("flex h-4 w-4 items-center justify-center rounded-sm", iconBg)}>
      <img src={icon} alt="" className="h-3 w-3" />
    </span>
  );
}

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

function VoiceOrb({ status, compact = false }: { status: "listening" | "processing" | "speaking"; compact?: boolean }) {
  const speaking = status === "speaking";
  const processing = status === "processing";

  // Outer glow ring — pulses fast + wide when speaking
  const outerScale = speaking
    ? [1, 1.45, 1.1, 1.55, 1, 1.35, 1]
    : processing
    ? [1, 1.12, 1]
    : [1, 1.06, 1];
  const outerDuration = speaking ? 1.0 : processing ? 2 : 3.5;

  // Main body rotation speed
  const bodyRotateDuration = speaking ? 1.8 : processing ? 3.5 : 7;

  // Inner core drifts around when speaking (speech rhythm x/y wobble)
  const coreX = speaking ? [0, 10, -6, 12, -9, 7, 0] : [0, 2, -2, 0];
  const coreY = speaking ? [0, -7, 9, -4, 7, -10, 0] : [0, -2, 2, 0];
  const coreScale = speaking
    ? [1, 1.25, 0.85, 1.35, 0.9, 1.2, 1]
    : processing
    ? [1, 1.08, 1]
    : [1, 1.04, 1];
  const coreDuration = speaking ? 1.3 : 3;

  // White flash center
  const flashScale = speaking
    ? [0.7, 1.6, 0.5, 1.8, 0.6, 1.4, 0.7]
    : [0.8, 1.1, 0.8];
  const flashDuration = speaking ? 0.55 : 2.2;

  const outerGrad = speaking
    ? "radial-gradient(circle, #06b6d4 0%, #6366f1 55%, transparent 75%)"
    : processing
    ? "radial-gradient(circle, #a855f7 0%, #7c3aed 55%, transparent 75%)"
    : "radial-gradient(circle, #8b5cf6 0%, #6366f1 55%, transparent 75%)";

  const bodyGrad = speaking
    ? "conic-gradient(from 0deg, #06b6d4, #6366f1, #a855f7, #0ea5e9, #06b6d4)"
    : processing
    ? "conic-gradient(from 0deg, #7c3aed, #a855f7, #ec4899, #8b5cf6, #7c3aed)"
    : "conic-gradient(from 0deg, #6366f1, #06b6d4, #8b5cf6, #0ea5e9, #6366f1)";

  const coreGrad = speaking
    ? "radial-gradient(circle, #ffffff 0%, #06b6d4 45%, #8b5cf6 85%)"
    : "radial-gradient(circle, #ffffff 0%, #a5b4fc 55%, #8b5cf6 100%)";

  const outer = compact ? "h-32 w-32" : "h-48 w-48";
  const body  = compact ? "h-24 w-24" : "h-36 w-36";
  const core  = compact ? "h-16 w-16" : "h-24 w-24";
  const flash = compact ? "h-7 w-7"   : "h-10 w-10";

  return (
    <div className={cn("relative flex items-center justify-center", outer)}>
      {/* Outer glow — expands dramatically when speaking */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ scale: outerScale }}
        transition={{ duration: outerDuration, ease: "easeInOut", repeat: Infinity }}
        style={{ background: outerGrad, filter: "blur(20px)", opacity: 0.55 }}
      />

      {/* Body — rotates, speeds up when speaking */}
      <motion.div
        className={cn("absolute rounded-full", body)}
        animate={{ rotate: 360 }}
        transition={{ duration: bodyRotateDuration, ease: "linear", repeat: Infinity }}
        style={{ background: bodyGrad, filter: "blur(6px)" }}
      />

      {/* Inner core — drifts around when speaking */}
      <motion.div
        className={cn("absolute rounded-full", core)}
        animate={{ x: coreX, y: coreY, scale: coreScale }}
        transition={{ duration: coreDuration, ease: "easeInOut", repeat: Infinity }}
        style={{ background: coreGrad, filter: "blur(4px)" }}
      />

      {/* White flash — rapid fire when speaking */}
      <motion.div
        className={cn("absolute rounded-full bg-white", flash)}
        animate={{ scale: flashScale, opacity: speaking ? [0.5, 1, 0.3, 1, 0.4, 0.9, 0.5] : [0.4, 0.75, 0.4] }}
        transition={{ duration: flashDuration, ease: "easeInOut", repeat: Infinity }}
        style={{ filter: "blur(7px)" }}
      />
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

/** One open chat tab's full UI + state (history sidebar, messages,
 * composer). Always mounted while its tab exists -- only CSS-hidden when
 * inactive -- so switching tabs preserves the draft, attachment, and
 * scroll position, same as how terminal tabs keep their tmux session
 * alive in the background. */
function ChatTabPanel({
  active,
  agentId,
  chatableAgents,
  onAgentChange,
  initialComposerText,
  historyCollapsed,
}: {
  active: boolean;
  agentId: string;
  chatableAgents: Agent[];
  onAgentChange: (agentId: string) => void;
  initialComposerText?: string;
  historyCollapsed: boolean;
}) {
  const [sessionId, setSessionId] = useState<string>("");
  const [composerText, setComposerText] = useState(initialComposerText ?? "");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<{ content: string; attachmentName: string | null } | null>(
    null
  );
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice conversation state
  type VoicePhase = "idle" | "checking" | "active" | "error";
  type CheckItem = { id: string; label: string; ok: boolean; detail?: string };

  const [voiceActive, setVoiceActive] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [, setVoiceChecklist] = useState<CheckItem[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<"listening" | "processing" | "speaking">("listening");
  const [voiceLiveText, setVoiceLiveText] = useState("");
  const [voiceMsgs, setVoiceMsgs] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [recRunning, setRecRunning] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState(""); // real-time interim text
  const voiceMsgsEndRef = useRef<HTMLDivElement>(null);
  // refs — callbacks never see stale React state
  const voiceActiveRef = useRef(false);
  const voiceStatusRef = useRef<"listening" | "processing" | "speaking">("listening");
  const ttsVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  // SpeechRecognition refs
  const srRef = useRef<any>(null);
  const srRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track consecutive SR sessions with no result; after 1 we switch to VAD permanently
  const srEmptyStreakRef = useRef(0);
  const srBrokenRef = useRef(false); // once true, skip SR and use VAD directly
  const [, setUsingVAD] = useState(false);
  // MediaRecorder + VAD fallback refs (used only when SR is unavailable)
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceVadRafRef = useRef<number>(0);
  const voiceVadActiveRef = useRef(false);
  // Barge-in: mic monitor during TTS, abort signal for active SSE stream
  const bargeInCtxRef = useRef<AudioContext | null>(null);
  const bargeInRafRef = useRef<number>(0);
  const voiceBargeInRef = useRef(false); // set true when user interrupts agent TTS
  const voiceMsgAbortRef = useRef<AbortController | null>(null); // cancel active SSE fetch

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
  const sendMessage = useSendChatMessage(agentId || undefined);
  const transcribe = useTranscribeAudio();

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingMessage]);

  // Auto-grow the composer with its content -- the single-line height is
  // the floor (never shrinks below it), and it grows up to
  // COMPOSER_MAX_HEIGHT_PX for large pastes/prompts before scrolling
  // internally. Recompute on `active` too: a tab seeded with a draft while
  // hidden (display:none) measures scrollHeight as 0 until shown.
  useEffect(() => {
    const el = composerTextareaRef.current;
    if (!el || !active) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [composerText, active]);

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

  // ── Voice conversation ───────────────────────────────────────────────────

  function setVoiceStatusSync(s: "listening" | "processing" | "speaking") {
    voiceStatusRef.current = s;
    setVoiceStatus(s);
  }

  // Ref to the currently playing Piper audio element (for barge-in cancellation)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  /** Cancel currently playing Piper audio (used by barge-in monitor). */
  function cancelTTS() {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }
    window.speechSynthesis.cancel(); // also cancel any fallback browser TTS
  }

  /** Short acknowledgment TTS using browser speech synthesis — fires-and-forgets.
   *  Plays while the agent API call is in-flight to reduce perceived latency. */

  /** TTS via Piper (natural Brazilian male voice).
   *  Falls back to browser speech synthesis if the fetch fails.
   *  noRestart: caller manages startListening() (used by drainTTS). */
  function speakTTS(text: string, onDone: () => void, noRestart = false) {
    stopListening();
    cancelTTS();

    const resume = () => {
      currentAudioRef.current = null;
      onDone();
      if (!noRestart) setTimeout(() => startListening(), 300);
    };

    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
    const token = localStorage.getItem("access_token") ?? "";

    fetch(`${apiBase}/api/v1/chat/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`TTS HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        const cleanup = () => { URL.revokeObjectURL(url); resume(); };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        audio.play().catch(cleanup);
      })
      .catch(() => {
        // Fallback to browser TTS if Piper unavailable
        if (!window.speechSynthesis) { resume(); return; }
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = "pt-BR";
        utt.rate = 1.0;
        utt.onend = resume;
        utt.onerror = resume;
        window.speechSynthesis.speak(utt);
      });
  }

  // ── Primary: SpeechRecognition (real-time, zero-latency) ─────────────────
  // Uses browser's built-in API (Chrome → Google servers).
  // Falls back to VAD+Whisper when SR is unavailable or not responding.

  function stopListening() {
    // Stop SR
    if (srRestartTimerRef.current) { clearTimeout(srRestartTimerRef.current); srRestartTimerRef.current = null; }
    try { srRef.current?.stop(); } catch { /* ignore */ }
    srRef.current = null;
    // Stop VAD fallback
    stopVAD();
    setRecRunning(false);
    setVoiceInterim("");
  }

  function startListening() {
    if (!voiceActiveRef.current) return;
    if (voiceStatusRef.current !== "listening") return;

    const SRCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    // Skip SR if we've already detected it doesn't work (network unreachable)
    if (SRCtor && !srBrokenRef.current) {
      _startSR(SRCtor);
    } else {
      startVAD();
    }
  }

  function _startSR(SRCtor: any) {
    if (!voiceActiveRef.current) return;
    if (voiceStatusRef.current !== "listening") return;

    const sr = new SRCtor();
    sr.lang = navigator.language || "pt-BR";
    sr.interimResults = true;
    sr.continuous = false;
    sr.maxAlternatives = 1;
    srRef.current = sr;
    setRecRunning(true);

    let gotResult = false; // did this session produce a transcript?

    // Don't wait for Chrome's built-in no-speech timeout (~5-7s) — abort after 4s
    const srAbortTimer = setTimeout(() => {
      if (!gotResult) {
        srBrokenRef.current = true;
        try { sr.stop(); } catch { /* onend will call startVAD */ }
      }
    }, 4000);

    sr.onresult = (e: any) => {
      clearTimeout(srAbortTimer);
      if (voiceStatusRef.current !== "listening") return;
      gotResult = true;
      srEmptyStreakRef.current = 0; // SR is working — reset failure counter
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) setVoiceInterim(interim);
      if (final.trim()) {
        setVoiceInterim("");
        void handleVoiceUserMessage(final.trim());
      }
    };

    sr.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setVoiceError("Microfone bloqueado. Autorize nas configurações do navegador.");
        stopVoice();
        return;
      }
      // Any non-permission error means SR won't work this session — go straight to VAD
      srBrokenRef.current = true;
      clearTimeout(srAbortTimer);
    };

    sr.onend = () => {
      clearTimeout(srAbortTimer);
      setRecRunning(false);
      if (!gotResult) {
        srEmptyStreakRef.current += 1;
        if (srEmptyStreakRef.current >= 1) {
          srBrokenRef.current = true;
          // Remember for future sessions — skip SR entirely in this browser
          try { localStorage.setItem("voice_sr_broken", "1"); } catch { /* ignore */ }
        }
      }
      if (!voiceActiveRef.current || voiceStatusRef.current !== "listening") return;
      if (srBrokenRef.current) {
        startVAD();
        return;
      }
      srRestartTimerRef.current = setTimeout(() => _startSR(SRCtor), 200);
    };

    try { sr.start(); } catch { /* already started — onend will retry */ }
  }

  // ── Fallback: VAD + MediaRecorder + Whisper ────────────────────────────
  /**
   * VAD + MediaRecorder voice input.
   * Uses AudioContext to detect speech energy, records with MediaRecorder,
   * and sends audio blobs to the backend Whisper transcription endpoint.
   * No dependency on Google's SpeechRecognition API.
   */
  function startVAD() {
    if (!voiceActiveRef.current) return;
    if (voiceVadActiveRef.current) return; // already running
    setUsingVAD(true);
    const stream = voiceStreamRef.current;
    if (!stream) return;

    voiceVadActiveRef.current = true;
    setRecRunning(true);

    const SILENCE_MS = 500;         // ms of silence = end of utterance
    const MIN_SPEECH_MS = 400;     // ignore bursts shorter than this (TV noise is often short)
    const MAX_RECORD_MS = 12000;   // force stop after 12s

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    voiceRecorderRef.current = recorder;
    voiceChunksRef.current = [];

    const flushRecording = () => {
      if (recorder.state === "recording") recorder.stop();
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) voiceChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Pause VAD during transcription + API call — speakTTS will restart it after TTS
      voiceVadActiveRef.current = false;
      cancelAnimationFrame(voiceVadRafRef.current);

      const chunks = [...voiceChunksRef.current];
      voiceChunksRef.current = [];
      if (!chunks.length || !voiceActiveRef.current) { startListening(); return; }
      if (voiceStatusRef.current !== "listening") return;

      const blob = new Blob(chunks, { type: mimeType });
      setVoiceStatusSync("processing");
      setVoiceLiveText("Transcrevendo…");
      try {
        const result = await transcribe.mutateAsync(blob);
        const text = result.text?.trim();
        setVoiceLiveText("");
        if (text && voiceActiveRef.current) {
          void handleVoiceUserMessage(text);
        } else {
          setVoiceStatusSync("listening");
          startListening();
        }
      } catch {
        setVoiceLiveText("");
        if (voiceActiveRef.current) { setVoiceStatusSync("listening"); startListening(); }
      }
    };

    // ── Noise-floor calibration (first 600ms) ───────────────────────────
    // Measure ambient noise so we can set a dynamic threshold above it.
    let threshold = 20; // default; overwritten after calibration
    let calibrationSum = 0;
    let calibrationCount = 0;
    const CALIBRATION_TICKS = 24; // ~400ms at 60fps

    let speechStart = 0;
    let silenceStart = 0;
    let speaking = false;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (!voiceVadActiveRef.current) return;

      try {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 64) * 100)));

        // Calibration phase — just measure, don't start recording
        if (calibrationCount < CALIBRATION_TICKS) {
          calibrationSum += avg;
          calibrationCount++;
          if (calibrationCount === CALIBRATION_TICKS) {
            const floor = calibrationSum / calibrationCount;
            // Threshold well above noise floor to reject background noise
            threshold = Math.max(35, floor * 2.8); // higher floor for TV-noise environments
          }
          voiceVadRafRef.current = requestAnimationFrame(tick);
          return;
        }

        const now = Date.now();
        const isSpeech = avg > threshold;

        if (isSpeech && voiceStatusRef.current === "listening") {
          silenceStart = 0;
          if (!speaking) {
            speaking = true;
            speechStart = now;
            voiceChunksRef.current = [];
            if (recorder.state === "inactive") recorder.start(100);
            setVoiceLiveText("🔴 Gravando…");
            maxTimer = setTimeout(() => { if (speaking) { speaking = false; flushRecording(); } }, MAX_RECORD_MS);
          }
        } else if (speaking) {
          if (!silenceStart) silenceStart = now;
          if (now - silenceStart >= SILENCE_MS) {
            speaking = false;
            if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
            const duration = now - speechStart;
            flushRecording();
            if (duration < MIN_SPEECH_MS) {
              voiceChunksRef.current = [];
              setVoiceLiveText("");
            }
            silenceStart = 0;
          }
        }
      } catch {
        // AudioContext or analyser error — stop VAD cleanly
        voiceVadActiveRef.current = false;
        setVoiceLiveText("");
        if (voiceActiveRef.current) {
          setVoiceStatusSync("listening");
          setTimeout(() => startListening(), 500);
        }
        return;
      }

      voiceVadRafRef.current = requestAnimationFrame(tick);
    };

    // Expose flush so the "Enviar agora" button can trigger it
    (voiceRecorderRef as any)._flush = flushRecording;

    voiceVadRafRef.current = requestAnimationFrame(tick);
  }

  function stopVAD() {
    voiceVadActiveRef.current = false;
    cancelAnimationFrame(voiceVadRafRef.current);
    try {
      if (voiceRecorderRef.current?.state === "recording") {
        voiceRecorderRef.current.stop();
      }
    } catch { /* ignore */ }
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    setRecRunning(false);
    setMicLevel(0);
  }

  // Barge-in monitor: lightweight mic energy check running in parallel during TTS.
  // When the user speaks while the agent is talking, cancels TTS and hands the mic back.
  function startBargeInMonitor() {
    const stream = voiceStreamRef.current;
    if (!stream || bargeInCtxRef.current) return;
    const ctx = new AudioContext();
    bargeInCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const d = new Uint8Array(analyser.frequencyBinCount);

    // Adaptive barge-in: measure ambient noise while not speaking, then require
    // the user's voice to be clearly above that baseline — avoids TV false triggers.
    const BARGE_FRAMES = 20;          // ~330ms sustained (was 9/150ms)
    const BARGE_MIN_THRESHOLD = 55;   // absolute floor even in quiet rooms
    const BARGE_FACTOR = 2.5;         // voice must be 2.5× louder than ambient
    let frames = 0;
    let ambientSum = 0;
    let ambientCount = 0;
    let bargeThreshold = BARGE_MIN_THRESHOLD;

    const monitor = () => {
      if (!voiceActiveRef.current) { ctx.close(); bargeInCtxRef.current = null; return; }

      try {
        analyser.getByteFrequencyData(d);
        const avg = d.reduce((s, v) => s + v, 0) / d.length;

        if (voiceStatusRef.current !== "speaking") {
          // Calibrate ambient noise level during listening/processing phases
          ambientSum += avg;
          ambientCount++;
          if (ambientCount % 60 === 0) { // recalibrate every ~1s
            const floor = ambientSum / ambientCount;
            bargeThreshold = Math.max(BARGE_MIN_THRESHOLD, floor * BARGE_FACTOR);
            ambientSum = 0; ambientCount = 0;
          }
          frames = 0;
          bargeInRafRef.current = requestAnimationFrame(monitor);
          return;
        }

        // Speaking phase: check for user barge-in above adaptive threshold
        if (avg > bargeThreshold) {
          frames++;
          if (frames >= BARGE_FRAMES) {
            frames = 0;
            voiceBargeInRef.current = true;
            voiceMsgAbortRef.current?.abort();
            cancelTTS();
          }
        } else {
          frames = 0;
        }
      } catch { /* ignore */ }
      bargeInRafRef.current = requestAnimationFrame(monitor);
    };
    bargeInRafRef.current = requestAnimationFrame(monitor);
  }

  function stopBargeInMonitor() {
    cancelAnimationFrame(bargeInRafRef.current);
    bargeInCtxRef.current?.close();
    bargeInCtxRef.current = null;
  }

  async function handleVoiceUserMessage(text: string) {
    if (!text.trim() || !agentId) return;
    setVoiceLiveText("");
    setVoiceStatusSync("processing");
    setVoiceMsgs((prev) => [...prev, { role: "user", text }]);

    let sid = sessionId;
    if (!sid) {
      const s = await createSession.mutateAsync({ agent_id: agentId });
      sid = s.id;
      setSessionId(sid);
    }

    // ── Streaming SSE path ───────────────────────────────────────────────
    let sentenceBuffer = "";
    let fullReply = "";
    let firstSentenceSpoken = false;
    let streamDone = false;          // true once SSE "done" event arrives
    const pendingTTS: string[] = [];
    let ttsRunning = false;

    const SENTENCE_RE = /[^.!?]*[.!?]+(?:\s|$)/;

    voiceBargeInRef.current = false; // reset from any prior barge-in

    function finishListening() {
      if (voiceBargeInRef.current) {
        // User interrupted — switch to listening immediately
        voiceBargeInRef.current = false;
        if (voiceActiveRef.current) {
          setVoiceStatusSync("listening");
          setTimeout(() => startListening(), 150);
        }
        return;
      }
      if (streamDone && pendingTTS.length === 0 && !ttsRunning && voiceActiveRef.current) {
        setVoiceStatusSync("listening");
        setTimeout(() => startListening(), 300);
      }
    }

    function drainTTS() {
      if (voiceBargeInRef.current) return; // barge-in: stop speaking
      if (ttsRunning || pendingTTS.length === 0) return;
      const sentence = pendingTTS.shift()!;
      ttsRunning = true;
      if (!firstSentenceSpoken) {
        firstSentenceSpoken = true;
        cancelTTS(); // cancel ack before first real sentence
        setVoiceStatusSync("speaking");
      }
      // noRestart=true: we manage startListening() via finishListening()
      speakTTS(sentence, () => {
        ttsRunning = false;
        drainTTS();       // start next queued sentence if any
        finishListening(); // no-op unless stream done + queue empty + no TTS
      }, true);
    }

    function flushSentences(final = false) {
      let buf = sentenceBuffer;
      let match;
      while ((match = SENTENCE_RE.exec(buf)) !== null) {
        pendingTTS.push(match[0].trim());
        buf = buf.slice(match[0].length);
        drainTTS();
      }
      sentenceBuffer = buf;
      if (final && buf.trim()) {
        pendingTTS.push(buf.trim());
        sentenceBuffer = "";
        drainTTS();
      }
    }

    // Short ack while waiting for first token (~2-4s)

    const abortCtrl = new AbortController();
    voiceMsgAbortRef.current = abortCtrl;

    try {
      const token = localStorage.getItem("access_token") ?? "";
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
      // voice=true → backend adds brevity instruction before sending to agent
      const url = `${apiBase}/api/v1/chat/sessions/${sid}/messages/stream?voice=true&message=${encodeURIComponent(text)}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortCtrl.signal,
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          let data: any;
          try { data = JSON.parse(raw); } catch { continue; }

          if (data.error) throw new Error(data.error);

          if (data.done) {
            streamDone = true;
            flushSentences(true);
            setVoiceMsgs((prev) => [...prev, { role: "assistant", text: fullReply }]);
            finishListening();
            break outer;
          }

          if (data.delta) {
            fullReply += data.delta;
            sentenceBuffer += data.delta;
            flushSentences(false);
          }
        }
      }

      // Stream closed without a "done" event (crash/timeout) — don't leave UI stuck
      if (!streamDone) {
        streamDone = true;
        if (fullReply.trim()) {
          flushSentences(true);
          setVoiceMsgs((prev) => [...prev, { role: "assistant", text: fullReply }]);
        }
        finishListening();
        if (!fullReply.trim() && voiceActiveRef.current) {
          setVoiceStatusSync("listening");
          startListening();
        }
      }

    } catch (err) {
      streamDone = true;
      cancelTTS();
      // AbortError = intentional barge-in; save whatever we accumulated before interrupting
      if ((err as any)?.name === "AbortError") {
        if (fullReply.trim()) {
          setVoiceMsgs((prev) => [...prev, { role: "assistant", text: fullReply }]);
        }
        finishListening();
        return;
      }
      if (voiceActiveRef.current) {
        setVoiceStatusSync("listening");
        startListening();
        setVoiceError(`Falha ao obter resposta: ${String(err)}`);
      }
    }
  }

  async function startVoice() {
    // ── Step 1: open overlay immediately ──────────────────────────────────
    setVoiceActive(true);
    setVoicePhase("checking");
    setVoiceChecklist([]);
    setVoiceMsgs([]);
    setVoiceError(null);
    voiceActiveRef.current = true;
    // If SR was already proven broken in this browser, skip straight to VAD
    srBrokenRef.current = localStorage.getItem("voice_sr_broken") === "1";
    srEmptyStreakRef.current = 0;
    setUsingVAD(srBrokenRef.current);

    // Unlock TTS synchronously before any await
    if (window.speechSynthesis) {
      const unlock = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(unlock);
      window.speechSynthesis.cancel();
    }

    // ── Step 2: pre-flight checks ─────────────────────────────────────────
    const items: CheckItem[] = [];
    const push = (item: CheckItem) => { items.push(item); setVoiceChecklist([...items]); };

    // MediaRecorder / getUserMedia support
    const hasRecorder = Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
    push({ id: "sr", label: "Gravação de áudio", ok: hasRecorder,
      detail: hasRecorder ? "Suportado" : "Navegador não suporta MediaRecorder — use Chrome ou Edge." });
    if (!hasRecorder) { setVoicePhase("error"); voiceActiveRef.current = false; return; }

    // SpeechSynthesis API + voices
    const hasTTS = Boolean(window.speechSynthesis);
    let voices = hasTTS ? window.speechSynthesis.getVoices() : [];
    if (hasTTS && voices.length === 0) {
      await new Promise<void>((res) => {
        const t = setTimeout(res, 2000);
        window.speechSynthesis.onvoiceschanged = () => { clearTimeout(t); res(); };
      });
      voices = window.speechSynthesis.getVoices();
    }
    ttsVoicesRef.current = voices;
    push({ id: "tts", label: "Síntese de voz (TTS)", ok: hasTTS && voices.length > 0,
      detail: !hasTTS ? "Não suportado" : voices.length === 0 ? "Sem vozes — respostas serão exibidas sem áudio" : `${voices.length} voz(es)` });

    // Microphone permission — open stream and keep it open for the whole conversation
    let micOk = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      voiceStreamRef.current = stream;
      micOk = true;
    } catch {
      micOk = false;
    }
    push({ id: "mic", label: "Microfone", ok: micOk,
      detail: micOk ? "Autorizado" : "Negado — clique no cadeado da barra de endereços e permita o microfone." });
    if (!micOk) { setVoicePhase("error"); voiceActiveRef.current = false; return; }

    // Barge-in monitor runs for the whole voice session
    startBargeInMonitor();

    // Show mic level meter briefly so user can confirm audio is coming in
    {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(voiceStreamRef.current!);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const d = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteFrequencyData(d);
        const avg = d.reduce((s, v) => s + v, 0) / d.length;
        setMicLevel(Math.min(100, Math.round((avg / 64) * 100)));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      await new Promise((res) => setTimeout(res, 1400));
      cancelAnimationFrame(raf);
      setMicLevel(0);
    }

    // ── Step 3: start conversation ────────────────────────────────────────
    setVoicePhase("active");
    setVoiceStatusSync("speaking");

    const agentName = selectedAgent?.name ?? "Assistente";
    const h = new Date().getHours();
    const period = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    const greeting = `${period}! Sou ${agentName}. Como posso ajudar você agora?`;
    setVoiceMsgs([{ role: "assistant", text: greeting }]);

    if (hasTTS && voices.length > 0) {
      speakTTS(greeting, () => {
        if (voiceActiveRef.current) setVoiceStatusSync("listening");
      });
    } else {
      setVoiceStatusSync("listening");
      startListening();
    }
  }

  function stopVoice() {
    voiceActiveRef.current = false;
    voiceMsgAbortRef.current?.abort();
    cancelTTS();
    stopListening();
    stopBargeInMonitor();
    voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceStreamRef.current = null;
    setVoiceActive(false);
    setVoicePhase("idle");
    setVoiceLiveText("");
    setVoiceError(null);
    setVoiceChecklist([]);
  }

  // scroll voice transcript to bottom
  useEffect(() => {
    voiceMsgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [voiceMsgs]);
  // ── end voice ────────────────────────────────────────────────────────────

  return (
    <div className={cn("absolute inset-0 flex gap-2 p-2", !active && "hidden")}>
      {!historyCollapsed && (
        <aside className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-sm font-medium text-muted-foreground">Chats</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" title="New chat" aria-label="New chat" onClick={handleNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
              <AgentPickerButton agents={chatableAgents} selectedAgentId={agentId} onSelect={onAgentChange} />
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

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* ── Voice conversation overlay ──────────────────────────── */}
        <AnimatePresence>
          {voiceActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-20 flex flex-col rounded-lg bg-card"
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Conversa por voz · {selectedAgent?.name}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stopVoice}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* ── Checklist phase ────────────────────────────────────── */}
              {voicePhase === "checking" && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <motion.div
                    className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  <p className="text-xs text-muted-foreground">Iniciando…</p>
                </div>
              )}
              {voicePhase === "error" && (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
                  <p className="text-sm text-destructive text-center">
                    {voiceError ?? "Não foi possível iniciar a conversa por voz."}
                  </p>
                  <Button variant="outline" size="sm" onClick={stopVoice}>
                    Fechar
                  </Button>
                </div>
              )}

              {/* ── Active conversation phase: transcript left + orb right ── */}
              {voicePhase === "active" && (
                <div className="relative flex flex-1 overflow-hidden">

                  {/* Transcript — recoils to 68%, stays scrollable */}
                  <motion.div
                    className="flex flex-col overflow-hidden border-r border-border/40"
                    initial={{ width: "100%" }}
                    animate={{ width: "68%" }}
                    transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                      {voiceMsgs.length === 0 && (
                        <p className="py-10 text-center text-sm italic text-muted-foreground">
                          Aguardando {selectedAgent?.name}…
                        </p>
                      )}
                      {voiceMsgs.map((m, i) => (
                        <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[88%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                            m.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          )}>
                            {m.text}
                          </div>
                        </div>
                      ))}
                      {/* SR interim — real-time transcription as user speaks */}
                      {voiceInterim && (
                        <div className="flex justify-end">
                          <div className="max-w-[88%] rounded-2xl border border-primary/40 px-4 py-2 text-sm italic text-primary/70">
                            {voiceInterim}
                          </div>
                        </div>
                      )}
                      {/* VAD / status text (Gravando…, Transcrevendo…) */}
                      {voiceLiveText && !voiceInterim && (
                        <div className="flex justify-end">
                          <div className="max-w-[88%] rounded-2xl border border-border px-4 py-2 text-sm italic text-muted-foreground">
                            {voiceLiveText}
                          </div>
                        </div>
                      )}
                      <div ref={voiceMsgsEndRef} />
                    </div>

                    {voiceError && (
                      <div className="shrink-0 mx-3 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {voiceError}
                      </div>
                    )}
                  </motion.div>

                  {/* Agent orb — slides in from right, covers 32% */}
                  <motion.div
                    className="absolute right-0 top-0 bottom-0 flex flex-col items-center justify-center gap-4 overflow-hidden bg-card/90 backdrop-blur-sm"
                    initial={{ width: "0%", opacity: 0 }}
                    animate={{ width: "32%", opacity: 1 }}
                    transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <VoiceOrb status={voiceStatus} compact />
                    <p className="text-center text-xs leading-relaxed text-muted-foreground px-3">
                      {{
                        listening: "Ouvindo…",
                        processing: `${selectedAgent?.name}\nestá pensando…`,
                        speaking: `${selectedAgent?.name}\nestá respondendo…`,
                      }[voiceStatus]}
                    </p>
                    {/* Mic level + status */}
                    <div className="flex flex-col items-center gap-1 w-full px-4">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "h-2 w-2 rounded-full",
                          recRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
                        )} />
                        <span className="text-[10px] text-muted-foreground">
                          {recRunning
                            ? "Mic ativo"
                            : voiceStatus === "speaking" ? "Agente falando" : "Aguardando…"}
                        </span>
                      </div>
                      {recRunning && (
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
                          <motion.div
                            className={cn("h-full rounded-full",
                              micLevel > 20 ? "bg-green-500" : "bg-muted-foreground/40")}
                            animate={{ width: `${micLevel}%` }}
                            transition={{ duration: 0.05 }}
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}

              {/* ── Footer — always visible inside the overlay ──────────── */}
              <div className="shrink-0 border-t border-border p-3 space-y-2">
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={stopVoice} className="gap-2">
                    <X className="h-4 w-4" />
                    Encerrar conversa por voz
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* ── end voice overlay ───────────────────────────────────── */}

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
          <div className="flex items-end gap-1 rounded-3xl border border-border bg-muted/50 px-2 py-1.5">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
            <AttachMenuButton onPickFile={() => fileInputRef.current?.click()} />
            <Textarea
              ref={composerTextareaRef}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              onPaste={handleComposerPaste}
              placeholder={`Peça ao ${selectedAgent?.name ?? "agente"}`}
              rows={1}
              style={{ maxHeight: COMPOSER_MAX_HEIGHT_PX }}
              className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <AgentSelectorPill agents={chatableAgents} selectedAgentId={agentId} onSelect={onAgentChange} />
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
            <Button
              variant={voiceActive ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-full shrink-0"
              aria-label={voiceActive ? "Encerrar conversa por voz" : `Conversa por voz com ${selectedAgent?.name ?? "agente"}`}
              title={voiceActive ? "Encerrar conversa por voz" : `Conversa por voz com ${selectedAgent?.name ?? "agente"}`}
              onClick={voiceActive ? stopVoice : startVoice}
              disabled={isRecording}
            >
              <AudioLines className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const { data: allAgents } = useAgents();
  const chatableAgents = useMemo(
    () => (allAgents ?? []).filter((a) => Boolean(a.profile_slug)),
    [allAgents]
  );

  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
    try {
      const raw = localStorage.getItem(TABS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as WorkspaceTab[]) : [];
    } catch {
      return [];
    }
  });
  const [activeTabId, setActiveTabId] = useState<string>(
    () => localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) ?? ""
  );
  const [workingDir, setWorkingDir] = useState<string | undefined>(undefined);

  // Seeds a freshly-opened chat tab's composer once at creation (e.g. from
  // the Crons/Scripts "Send to chat" handoff) -- read once via useState's
  // initializer in ChatTabPanel, never re-applied after.
  const draftSeedsRef = useRef<Map<string, string>>(new Map());
  const consumeDraft = useChatHandoffStore((s) => s.consumeDraft);

  // Native HTML5 drag-and-drop for tab reordering -- a ref (not state) so
  // dragging doesn't trigger re-renders; only the drop commits a change.
  const dragTabIdRef = useRef<string | null>(null);

  // Drops the dragged tab immediately after the drop target, regardless of
  // whether the drag moved forward or backward in the list -- computing
  // the insertion index from the *post-removal* array (rather than the
  // original) avoids an off-by-one that otherwise cancels out
  // forward-adjacent drags.
  function handleTabDrop(targetId: string) {
    const draggedId = dragTabIdRef.current;
    dragTabIdRef.current = null;
    if (!draggedId || draggedId === targetId) return;
    setTabs((prev) => {
      const draggedIndex = prev.findIndex((t) => t.id === draggedId);
      if (draggedIndex === -1) return prev;
      const next = [...prev];
      const [dragged] = next.splice(draggedIndex, 1);
      const targetIndex = next.findIndex((t) => t.id === targetId);
      if (targetIndex === -1) return prev;
      next.splice(targetIndex + 1, 0, dragged);
      return next;
    });
  }

  useEffect(() => {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
  }, [activeTabId]);

  function openChatTab(agentId: string, draft?: string) {
    const id = crypto.randomUUID();
    if (draft) draftSeedsRef.current.set(id, draft);
    setTabs((t) => [...t, { kind: "chat", id, agentId }]);
    setActiveTabId(id);
  }

  function openTerminalTab(label: string, command?: string) {
    const id = crypto.randomUUID();
    setTabs((t) => [...t, { kind: "terminal", id, label, command, cwd: workingDir }]);
    setActiveTabId(id);
  }

  function closeTab(id: string) {
    const tab = tabs.find((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    setActiveTabId((current) => (current === id ? remaining[remaining.length - 1]?.id ?? "" : current));
    if (tab?.kind === "terminal") {
      // Fire-and-forget: this is the one place a tab's session should
      // actually end, as opposed to every other disconnect (tab switch,
      // navigating away), which only detaches and leaves it running.
      apiClient.post(`/api/v1/terminal/sessions/${id}/kill`).catch(() => {});
    }
  }

  function handleAgentChangeForTab(tabId: string, agentId: string) {
    setTabs((t) => t.map((x) => (x.id === tabId && x.kind === "chat" ? { ...x, agentId } : x)));
  }

  function toggleHistoryCollapsed(tabId: string) {
    setTabs((t) =>
      t.map((x) => (x.id === tabId && x.kind === "chat" ? { ...x, historyCollapsed: !x.historyCollapsed } : x))
    );
  }

  // Runs once chatableAgents is available: consume a pending "send to
  // chat" draft into a brand-new tab, or (if there's no draft and no tabs
  // were restored from storage) open one default chat tab so the page
  // isn't empty on first visit.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current || chatableAgents.length === 0) return;
    initRef.current = true;
    const draft = consumeDraft();
    if (draft) {
      openChatTab(chatableAgents[0].id, draft);
    } else if (tabs.length === 0) {
      openChatTab(chatableAgents[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatableAgents]);

  const activeChatTab = tabs.find(
    (t): t is WorkspaceTab & { kind: "chat" } => t.id === activeTabId && t.kind === "chat"
  );

  function defaultAgentIdForNewTab(): string {
    return activeChatTab?.agentId ?? chatableAgents[0]?.id ?? "";
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
    <div className="flex min-h-0 flex-1 flex-col pl-4">
      <div className="flex flex-col border-b border-border">
        {/* Toolbar: static actions on the left, working-dir/launchers on the right. */}
        <div className="flex items-center gap-1 px-2 py-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!activeChatTab}
            aria-label={activeChatTab?.historyCollapsed ? "Show chat history" : "Hide chat history"}
            title="Toggle chat history sidebar"
            onClick={() => activeChatTab && toggleHistoryCollapsed(activeChatTab.id)}
          >
            {activeChatTab?.historyCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 shrink-0"
            onClick={() => openChatTab(defaultAgentIdForNewTab())}
          >
            <MessageSquare className="h-4 w-4" />
            New Chat
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 shrink-0"
            onClick={() => openTerminalTab("bash")}
          >
            <SquareTerminal className="h-4 w-4" />
            New Terminal
          </Button>
          <div className="flex-1" />
          <WorkingDirPicker workingDir={workingDir} onSelect={setWorkingDir} />
          <div className="mx-1 h-5 w-px bg-border" />
          <span className="text-[10px] font-medium uppercase text-muted-foreground" title="Coding-assistant CLIs">
            CLI
          </span>
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
              <LauncherIcon icon={l.icon} iconBg={l.iconBg} />
            </Button>
          ))}
          <div className="mx-1 h-5 w-px bg-border" />
          <span className="text-[10px] font-medium uppercase text-muted-foreground" title="Agent runtimes/orchestrators">
            Runtimes
          </span>
          {RUNTIME_LAUNCHERS.map((l) => (
            <Button
              key={l.command}
              variant="outline"
              size="icon"
              className="h-7 w-7"
              title={l.label}
              aria-label={`Open ${l.label}`}
              onClick={() => openTerminalTab(l.label, l.command)}
            >
              <LauncherIcon icon={l.icon} iconBg={l.iconBg} />
            </Button>
          ))}
        </div>

        {/* Dedicated tab strip: sortable (drag-and-drop) + horizontal scroll. */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-2 py-1">
          {tabs.map((t) =>
            t.kind === "chat" ? (
              <div
                key={t.id}
                draggable
                onDragStart={() => (dragTabIdRef.current = t.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleTabDrop(t.id)}
                onClick={() => setActiveTabId(t.id)}
                className={cn(
                  "group flex shrink-0 cursor-grab items-center gap-1.5 rounded-md px-3 py-1 text-sm active:cursor-grabbing",
                  t.id === activeTabId
                    ? "bg-accent text-accent-foreground"
                    : "cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {chatableAgents.find((a) => a.id === t.agentId)?.name ?? "Chat"}
                <button
                  type="button"
                  aria-label="Close chat tab"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div
                key={t.id}
                draggable
                onDragStart={() => (dragTabIdRef.current = t.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleTabDrop(t.id)}
                onClick={() => setActiveTabId(t.id)}
                className={cn(
                  "group flex shrink-0 cursor-grab items-center gap-1.5 rounded-md px-3 py-1 text-sm active:cursor-grabbing",
                  t.id === activeTabId
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
                    closeTab(t.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          )}
        </div>
      </div>

      <div className="relative flex-1">
        {tabs.map((t) =>
          t.kind === "chat" ? (
            <ChatTabPanel
              key={t.id}
              active={t.id === activeTabId}
              agentId={t.agentId}
              chatableAgents={chatableAgents}
              onAgentChange={(agentId) => handleAgentChangeForTab(t.id, agentId)}
              initialComposerText={draftSeedsRef.current.get(t.id)}
              historyCollapsed={Boolean(t.historyCollapsed)}
            />
          ) : (
            <div key={t.id} className={cn("absolute inset-0 p-2", t.id !== activeTabId && "hidden")}>
              <TerminalPane sessionId={t.id} command={t.command} cwd={t.cwd} active={t.id === activeTabId} />
            </div>
          )
        )}

        {tabs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-muted-foreground">
            <div>
              <MessageSquare className="mx-auto mb-3 h-10 w-10" />
              <p className="font-medium">No tabs open</p>
              <p className="text-sm">Start a chat or open a terminal using the buttons above.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
