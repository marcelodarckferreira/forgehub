#!/usr/bin/env python
"""Streaming helper — runs as a subprocess of the bridge.

Writes lines to stdout:
  {"delta": "<text>"}          — one per token
  {"done": true, "session_id": "...", "reply": "..."}  — final line
  {"error": "..."}             — on failure (final line)

Must be run from HERMES_HOME set to the target profile directory, e.g.:
  HERMES_HOME=/root/.hermes/profiles/athos python hermes_stream.py ...
"""
import json
import os
import sys

def main() -> None:
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--profile-home", required=True)
    p.add_argument("--message", required=True)
    p.add_argument("--session-id", default=None)
    args = p.parse_args()

    os.environ["HERMES_HOME"] = args.profile_home
    os.environ.setdefault("HERMES_SESSION_SOURCE", "tool")

    sys.path.insert(0, "/usr/local/lib/hermes-agent")
    os.chdir(args.profile_home)

    try:
        from cli import HermesCLI  # type: ignore
    except Exception as exc:
        sys.stdout.write(json.dumps({"error": f"import failed: {exc}"}) + "\n")
        sys.stdout.flush()
        return

    try:
        cli_inst = HermesCLI(resume=args.session_id)
        cli_inst.tool_progress_mode = "off"

        full_parts: list[str] = []

        def on_delta(delta: str) -> None:
            full_parts.append(delta)
            sys.stdout.write(json.dumps({"delta": delta}) + "\n")
            sys.stdout.flush()

        if not cli_inst._init_agent():
            raise RuntimeError("_init_agent() returned False")

        result = cli_inst.agent.run_conversation(
            user_message=args.message,
            conversation_history=cli_inst.conversation_history,
            stream_callback=on_delta,
        )
        new_sid = cli_inst.session_id
        full_reply = result.get("final_response", "".join(full_parts))
        sys.stdout.write(
            json.dumps({"done": True, "session_id": new_sid, "reply": full_reply}) + "\n"
        )
        sys.stdout.flush()

    except Exception as exc:
        sys.stdout.write(json.dumps({"error": str(exc)}) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
