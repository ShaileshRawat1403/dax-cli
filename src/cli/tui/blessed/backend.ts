import blessed from "blessed";
import type { TUIBackend, ChatMessage, ToolState, GateState, ContextState, DaxStreamEvent, StreamState } from "../interfaces/backend.js";

// OpenCode.ai style theme colors
const theme = {
  accent: "cyan",
  success: "green",
  warning: "yellow",
  error: "red",
  dim: "gray",
  border: "gray",
  user: "lightblue",
  assistant: "lightgreen",
  text: "white",
};

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), ms)
  }) as T
}

export class BlessedBackend implements TUIBackend {
  name: "blessed" = "blessed";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private screen: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private header: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private main: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private input: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sidebar: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private contextPanel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toolPanel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private statusBar: any;

  private messages: ChatMessage[] = [];
  private currentStream = "";
  private streamState: StreamState = "done";
  private currentTool: string | null = null;
  private tools: ToolState[] = [];
  private gate: GateState | null = null;
  private context: ContextState = { files: [], scope: [] };
  private phase = "";
  private step = "";

  private onSend?: (message: string) => void | Promise<void>;
  private onCommand?: (command: string) => void | Promise<void>;
  private debouncedRender: () => void;
  private lastSubmitted = "";
  private lastSubmittedAt = 0;
  private handlingSubmit = false;

  constructor() {
    // Check if we have a real TTY
    if (!process.stdout.isTTY) {
      console.error("ERROR: TUI requires a real terminal. Use interactive mode instead: dax -i");
      console.error("Falling back to interactive CLI mode...");
      throw new Error("No TTY available");
    }
    
    this.screen = this.createScreen();
    this.header = this.createHeader();
    this.sidebar = this.createSidebar();
    this.main = this.createMain();
    this.input = this.createInput();
    this.statusBar = this.createStatusBar();
    this.contextPanel = this.createContextPanel();
    this.toolPanel = this.createToolPanel();

    this.setupLayout();
    this.setupInput();
    
    this.debouncedRender = debounce(() => this.render(), 16);
  }

  private createScreen() {
    return blessed.screen({
      smartCSR: true,
      title: "DAX",
      fullUnicode: true,
      terminal: "xterm-256color",
    });
  }

  private createHeader() {
    return blessed.box({
      top: 0,
      tags: true,
      left: 0,
      right: 0,
      height: 3,
      border: { type: "line" },
      style: { border: { fg: theme.border } },
    });
  }

  private createSidebar() {
    return blessed.box({
      top: 3,
      tags: true,
      right: 0,
      width: "30%",
      bottom: 0,
      border: { type: "line" },
      style: { border: { fg: theme.border } },
    });
  }

  private createMain() {
    return blessed.box({
      top: 3,
      left: 0,
      tags: true,
      right: "30%",
      bottom: 4,
      scrollable: true,
      alwaysScroll: true,
      style: { transparent: true },
    });
  }

  private createInput() {
    return blessed.textbox({
      bottom: 0,
      tags: true,
      left: 0,
      right: 0,
      height: 3,
      border: { type: "line" },
      style: {
        border: { fg: theme.border },
        focus: { border: { fg: theme.accent } },
      },
      inputOnFocus: true,
      keys: true,
      mouse: true,
    });
  }

  private createStatusBar() {
    return blessed.box({
      bottom: 3,
      tags: true,
      left: 0,
      right: "30%",
      height: 1,
    });
  }

  private createContextPanel() {
    return blessed.box({
      top: 1,
      tags: true,
      left: 1,
      right: 1,
      height: "50%",
    });
  }

  private createToolPanel() {
    return blessed.box({
      top: "50%",
      tags: true,
      left: 1,
      right: 1,
      bottom: 1,
    });
  }

  private setupLayout() {
    this.screen.append(this.header);
    this.screen.append(this.sidebar);
    this.screen.append(this.main);
    this.screen.append(this.input);
    this.screen.append(this.statusBar);

    this.sidebar.append(this.contextPanel);
    this.sidebar.append(this.toolPanel);
  }

  private setupInput() {
    const submit = async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      if (this.handlingSubmit) return;

      const now = Date.now();
      if (value === this.lastSubmitted && now - this.lastSubmittedAt < 350) return;
      this.lastSubmitted = value;
      this.lastSubmittedAt = now;
      this.handlingSubmit = true;

      try {
        if (value.startsWith("/")) {
          await this.onCommand?.(value);
        } else {
          await this.onSend?.(value);
        }
      } finally {
        this.handlingSubmit = false;
      }

      this.input.clearValue();
      this.input.focus();
      this.render();
    };

    this.input.on("submit", async (value: string) => {
      await submit(value);
    });

    // Key handlers
    this.screen.key(["C-c", "C-d", "q"], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.key("escape", () => {
      // Clear input on escape
      this.input.clearValue();
    });
  }

  private renderHeader() {
    const stateColors: Record<StreamState, string> = {
      request_sent: theme.accent,
      awaiting_first_token: theme.warning,
      streaming: theme.success,
      tool_executing: theme.accent,
      done: theme.dim,
      error: theme.error,
    };

    const stateLabels: Record<StreamState, string> = {
      request_sent: "⟳ Thinking",
      awaiting_first_token: "◐ Waiting",
      streaming: "▮ Streaming",
      tool_executing: "⚙ Tools",
      done: "✓ Ready",
      error: "✕ Error",
    };

    let content = `{bold}{cyan-fg} DAX{/cyan-fg}{/bold} {${stateColors[this.streamState]}-fg}${stateLabels[this.streamState]}{/${stateColors[this.streamState]}-fg}`;

    if (this.phase && this.step) {
      content += ` {gray-fg}•{/gray-fg} {gray-fg}${this.phase}{/gray-fg} → ${this.step}`;
    }

    this.header.setContent(content);
  }

  private renderMessages() {
    let content = "";

    for (const msg of this.messages) {
      const roleLabel = msg.role === "user" ? "You" : msg.role === "assistant" ? "DAX" : "System";
      const roleColor = msg.role === "user" ? theme.user : msg.role === "assistant" ? theme.assistant : theme.error;

      content += `{bold}{${roleColor}-fg}▸ ${roleLabel}{/bold}\n`;
      content += `   ${msg.content}\n`;

      if (msg.toolCalls?.length) {
        content += `\n`;
        for (const tool of msg.toolCalls) {
          const statusIcon = tool.status === "success" ? "✓" : tool.status === "error" ? "✕" : tool.status === "running" ? "◐" : "○";
          const statusColor = tool.status === "success" ? theme.success : tool.status === "error" ? theme.error : tool.status === "running" ? theme.warning : theme.dim;
          content += `   {${statusColor}-fg}${statusIcon} ${tool.name}{/${statusColor}-fg}\n`;
        }
      }
      content += "\n";
    }

    if (this.currentStream) {
      content += `{bold}{${theme.assistant}-fg}▸ DAX{/bold}\n`;
      content += `   ${this.currentStream}\n`;
    }

    if (this.streamState === "awaiting_first_token") {
      content += `\n{${theme.warning}-fg}◐ Waiting for response...{/${theme.warning}-fg}`;
    }

    if (this.streamState === "request_sent") {
      content += `\n{${theme.accent}-fg}⟳ Thinking...{/${theme.accent}-fg}`;
    }

    this.main.setContent(content);
    this.main.setScrollPerc(100);
  }

  private renderContext() {
    let content = `{bold}{cyan-fg}Files{/cyan-fg}{/bold}\n\n`;

    if (this.context.files.length === 0) {
      content += `  {gray-fg}No files loaded{/gray-fg}\n`;
    } else {
      for (const file of this.context.files.slice(0, 5)) {
        content += `  • ${file}\n`;
      }
      if (this.context.files.length > 5) {
        content += `  {gray-fg}+${this.context.files.length - 5} more{/gray-fg}\n`;
      }
    }

    content += `\n{bold}{cyan-fg}Scope{/cyan-fg}{/bold}\n\n`;
    if (this.context.scope.length === 0) {
      content += `  {gray-fg}No scope defined{/gray-fg}\n`;
    } else {
      for (const s of this.context.scope.slice(0, 5)) {
        content += `  • ${s}\n`;
      }
    }

    this.contextPanel.setContent(content);
  }

  private renderTools() {
    let content = `{bold}{cyan-fg}Tools{/cyan-fg}{/bold}`;

    if (this.currentTool) {
      content += ` {yellow-fg}(${this.currentTool}){/yellow-fg}`;
    }
    content += "\n\n";

    if (this.tools.length === 0) {
      content += `{gray-fg}No tools executed{/gray-fg}\n`;
    } else {
      for (const tool of this.tools) {
        const statusIcon = tool.status === "pending" ? "◌" : tool.status === "running" ? "◐" : tool.status === "success" ? "✓" : "✕";
        const statusColor = tool.status === "success" ? theme.success : tool.status === "error" ? theme.error : tool.status === "running" ? theme.warning : theme.dim;

        content += `{${statusColor}-fg}${statusIcon}{/${statusColor}-fg} ${tool.name}`;
        if (tool.elapsed !== undefined) {
          content += ` {gray-fg}(${tool.elapsed}ms){/gray-fg}`;
        }
        content += "\n";

        if (tool.output) {
          content += `  {gray-fg}${tool.output.slice(0, 100)}${tool.output.length > 100 ? "..." : ""}{/gray-fg}\n`;
        }
      }
    }

    this.toolPanel.setContent(content);
  }

  private render() {
    this.renderHeader();
    this.renderMessages();
    this.renderContext();
    this.renderTools();
    this.screen.render();
  }

  dispatch(event: DaxStreamEvent) {
    switch (event.type) {
      case "state":
        this.streamState = event.data.state || "done";
        this.render();
        break;

      case "text_delta":
        this.currentStream += event.data.text || "";
        this.debouncedRender();
        break;

      case "tool_call":
        this.currentTool = event.data.tool?.name || null;
        this.tools.push({
          name: event.data.tool?.name || "",
          id: event.data.tool?.id || "",
          status: "pending",
        });
        this.streamState = "tool_executing";
        break;

      case "tool_result": {
        const success = event.data.result?.success;
        this.currentTool = null;
        this.tools = this.tools.map((t) =>
          t.id === event.data.result?.tool_id
            ? {
                ...t,
                status: success ? "success" : "error",
                output: event.data.result?.output,
                elapsed: event.data.result?.elapsed_ms,
              }
            : t
        );
        this.streamState = "streaming";
        break;
      }

      case "gate":
        if (event.data.gate) {
          this.gate = {
            active: true,
            id: event.data.gate.id || "",
            blocked: event.data.gate.blocked,
            warnings: event.data.gate.warnings,
          };
        }
        break;

      case "complete":
        if (this.currentStream || this.tools.length > 0) {
          this.messages.push({
            role: "assistant",
            content: this.currentStream,
            timestamp: Date.now(),
            toolCalls: this.tools.map((t) => ({
              name: t.name,
              id: t.id,
              status: t.status,
            })),
          });
          this.currentStream = "";
          this.tools = [];
          this.streamState = "done";
        }
        break;

      case "error":
        this.messages.push({
          role: "system",
          content: `Error: ${event.data.error?.message}`,
          timestamp: Date.now(),
        });
        this.streamState = "error";
        break;
    }

    this.render();
  }

  addUserMessage(content: string) {
    this.messages.push({
      role: "user",
      content,
      timestamp: Date.now(),
    });
    this.currentStream = "";
    this.streamState = "request_sent";
    this.render();
  }

  setContext(context: ContextState) {
    this.context = context;
    this.render();
  }

  updateState(state: StreamState) {
    this.streamState = state;
    this.render();
  }

  setSendHandler(fn: (message: string) => void | Promise<void>) {
    this.onSend = fn;
  }

  setCommandHandler(fn: (command: string) => void | Promise<void>) {
    this.onCommand = fn;
  }

  focusInput() {
    if (this.screen.focused === this.input) return;
    this.input.focus();
    this.render();
  }

  destroy() {
    this.screen.destroy();
  }
}

export function createBlessedBackend(): TUIBackend {
  return new BlessedBackend();
}
