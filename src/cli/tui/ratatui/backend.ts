import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { TUIBackend, ContextState, DaxStreamEvent, StreamState } from "../interfaces/backend.js";

export class RatatuiBackend implements TUIBackend {
  name: "ratatui" = "ratatui";
  private process: ChildProcess | null = null;
  private onSend?: (message: string) => void | Promise<void>;
  private onCommand?: (command: string) => void | Promise<void>;
  private ready = false;

  constructor() {
    // Check if we have a real TTY, but don't fail - just warn
    if (!process.stdout.isTTY) {
      console.warn("Note: TUI works best in a real terminal. Running in limited mode.");
    }
    this.startProcess();
  }

  private startProcess() {
    const tuiPath = this.findTuiBinary();

    if (!tuiPath) {
      console.error("Ratatui TUI binary not found. Run 'cargo build --release' in crates/dax-tui");
      return;
    }

    this.process = spawn(tuiPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, RUST_BACKTRACE: "1", DAX_TUI_ALLOW_PIPE: "1" },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const msg = JSON.parse(line);

          if (msg.type === "input") {
            const content = msg.content;
            if (content.startsWith("/")) {
              void this.onCommand?.(content);
            } else {
              void this.onSend?.(content);
            }
          }
        } catch {
          // Non-JSON output (logs, etc.)
        }
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (!text) return;
      console.error(`ratatui: ${text}`);
    });

    this.process.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`Ratatui TUI exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    });

    this.process.on("error", (_err: Error) => {
      console.error("Ratatui TUI error:", _err);
    });

    this.ready = true;
  }

  private findTuiBinary(): string | null {
    const paths = [
      "./crates/dax-tui/target/release/dax-tui",
      "./crates/dax-tui/target/debug/dax-tui",
      "/usr/local/bin/dax-tui",
    ];

    for (const p of paths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  private send(message: object) {
    if (this.process?.stdin && this.ready) {
      this.process.stdin.write(JSON.stringify(message) + "\n");
    }
  }

  dispatch(event: DaxStreamEvent) {
    switch (event.type) {
      case "meta":
        this.send({
          type: "dispatch",
          event: { type: "meta", data: { provider: event.data.provider, model: event.data.model } },
        });
        break;
      case "state":
        this.send({ type: "dispatch", event: { type: "state", data: { state: event.data.state } } });
        break;
      case "text_delta":
        this.send({ type: "dispatch", event: { type: "text_delta", data: { text: event.data.text } } });
        break;
      case "tool_call":
        this.send({
          type: "dispatch",
          event: {
            type: "tool_call",
            data: { name: event.data.tool?.name, id: event.data.tool?.id },
          },
        });
        break;
      case "tool_result":
        this.send({
          type: "dispatch",
          event: {
            type: "tool_result",
            data: {
              tool_id: event.data.result?.tool_id,
              success: event.data.result?.success,
              output: event.data.result?.output,
              elapsed_ms: event.data.result?.elapsed_ms,
            },
          },
        });
        break;
      case "complete":
        this.send({ type: "dispatch", event: { type: "complete", data: {} } });
        break;
      case "error":
        this.send({ type: "dispatch", event: { type: "error", data: { message: event.data.error?.message } } });
        break;
      case "gate":
        this.send({
          type: "dispatch",
          event: {
            type: "gate",
            data: { id: event.data.gate?.id, blocked: event.data.gate?.blocked, warnings: event.data.gate?.warnings },
          },
        });
        break;
      case "gate_resolved":
        this.send({
          type: "dispatch",
          event: { type: "gate", data: { id: event.data.resolution?.action } },
        });
        break;
      case "tool_start":
      case "tool_ok":
      case "tool_fail":
        break;
    }
  }

  addUserMessage(content: string) {
    this.send({ type: "addUserMessage", content });
  }

  setContext(context: ContextState) {
    this.send({ type: "setContext", files: context.files, scope: context.scope });
  }

  updateState(state: StreamState) {
    this.send({ type: "updateState", state });
  }

  setSendHandler(fn: (message: string) => void | Promise<void>) {
    this.onSend = fn;
  }

  setCommandHandler(fn: (command: string) => void | Promise<void>) {
    this.onCommand = fn;
  }

  focusInput() {
    // Ratatui handles this automatically
  }

  destroy() {
    this.send({ type: "destroy" });
    this.process?.kill();
    this.ready = false;
  }
}

export function createRatatuiBackend(): TUIBackend {
  return new RatatuiBackend();
}
