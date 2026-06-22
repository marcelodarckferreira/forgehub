import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
const WS_BASE = API_BASE.replace(/^http/, "ws");

interface TerminalPaneProps {
  /** Stable id for this tab (the tmux session name on the host) -- reusing
   * the same id across reconnects (e.g. after navigating away and back) is
   * what lets the host-bridge re-attach to the same tmux session instead of
   * starting a new shell, so the running process survives the round trip. */
  sessionId: string;
  /** Launcher to type into the shell once it's up (e.g. "claude"), or
   * undefined for a plain bash session. Only applied when the host-bridge
   * creates the session for the first time -- ignored on reattach. */
  command?: string;
  /** Host directory to `cd` into before the launcher (or the bare shell)
   * starts -- see WorkingDirPicker. */
  cwd?: string;
  /** Whether this pane's tab is currently selected -- panes for inactive
   * tabs stay mounted (so the session keeps running) but hidden. */
  active: boolean;
}

export function TerminalPane({ sessionId, command, cwd, active }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: { background: "#0a0a0f" },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    fitAddonRef.current = fitAddon;
    termRef.current = term;

    const params = new URLSearchParams();
    params.set("session", sessionId);
    if (command) params.set("command", command);
    if (cwd) params.set("cwd", cwd);
    const ws = new WebSocket(`${WS_BASE}/api/v1/terminal/ws?${params.toString()}`);

    // The PTY is read in fixed-size chunks on the host, so the DECRQM
    // sequence stripped below can land split across two WebSocket messages.
    // Hold back a trailing prefix that could still grow into a full match
    // (rather than writing it immediately) and prepend it to the next
    // message, so the strip below can't be defeated by an unlucky chunk
    // boundary.
    let pendingTail = "";
    ws.onmessage = (event) => {
      // @xterm/xterm 6.0.0's DECRQM handler (CSI ? Pm $ p, used by CLIs like
      // Antigravity's `agy` to probe synchronized-output support) throws
      // "r is not defined" inside its own minified bundle and corrupts the
      // parser for the rest of the session -- strip the query before it
      // ever reaches xterm's parser. The app being probed just treats a
      // missing reply as "unsupported", same as without this fix's filtering.
      const raw = pendingTail + (event.data as string);
      const partial = raw.match(/\x1b\[\??[0-9;]*\$?$/);
      const safeEnd = partial ? partial.index! : raw.length;
      pendingTail = raw.slice(safeEnd);
      const data = raw.slice(0, safeEnd).replace(/\x1b\[\??[0-9;]*\$p/g, "");
      term.write(data);
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    const inputDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // The PTY only carries keystrokes, not the browser's clipboard -- a
    // pasted image has no representation as terminal input. Instead, upload
    // it and type its host file path, the same way dragging a file onto a
    // real terminal does; CLI agents (claude/codex/agy) that support image
    // input read it by path from there.
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith("image/")
      );
      if (!imageItem) return;
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (!file || ws.readyState !== WebSocket.OPEN) return;

      const formData = new FormData();
      formData.append("file", file, file.name || "pasted-image.png");
      fetch(`${API_BASE}/api/v1/terminal/upload-image`, { method: "POST", body: formData })
        .then((res) => res.json())
        .then((body: { path: string }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data: `'${body.path}' ` }));
          }
        })
        .catch(() => {});
    };
    container.addEventListener("paste", handlePaste);

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    resizeObserver.observe(container);

    return () => {
      inputDisposable.dispose();
      container.removeEventListener("paste", handlePaste);
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
    // sessionId/command/cwd are fixed for the lifetime of a tab -- only mount/unmount matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    fitAddonRef.current?.fit();
    // The pane's parent toggles display:none while inactive, so the
    // background process can keep redrawing (e.g. Hermes's live activity
    // feed) while nothing is on screen to receive it. Force a full repaint
    // on becoming visible again instead of waiting for the next byte from
    // the PTY, which could be seconds away or never come if it's idle.
    const term = termRef.current;
    if (term) term.refresh(0, term.rows - 1);
  }, [active]);

  return <div ref={containerRef} className="h-full w-full" />;
}
