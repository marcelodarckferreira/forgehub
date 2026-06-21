import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
const WS_BASE = API_BASE.replace(/^http/, "ws");

interface TerminalPaneProps {
  /** Launcher to type into the shell once it's up (e.g. "claude"), or
   * undefined for a plain bash session. */
  command?: string;
  /** Host directory to `cd` into before the launcher (or the bare shell)
   * starts -- see WorkingDirPicker. */
  cwd?: string;
  /** Whether this pane's tab is currently selected -- panes for inactive
   * tabs stay mounted (so the session keeps running) but hidden. */
  active: boolean;
}

export function TerminalPane({ command, cwd, active }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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

    const params = new URLSearchParams();
    if (command) params.set("command", command);
    if (cwd) params.set("cwd", cwd);
    const ws = new WebSocket(`${WS_BASE}/api/v1/terminal/ws?${params.toString()}`);

    ws.onmessage = (event) => term.write(event.data as string);
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
    // command/cwd are fixed for the lifetime of a tab -- only mount/unmount matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (active) fitAddonRef.current?.fit();
  }, [active]);

  return <div ref={containerRef} className="h-full w-full" />;
}
