import type { LLMConfig, LLMResponse, Message, Tool } from "../llm/types.js";

function prompt(messages: Message[]) {
  return messages.map((msg) => `${msg.role.toUpperCase()}:\n${msg.content}`).join("\n\n");
}

async function run(args: string[]) {
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const code = await proc.exited;
  const stdout = (await new Response(proc.stdout).text()).trim();
  const stderr = (await new Response(proc.stderr).text()).trim();
  return { code, stdout, stderr };
}

export class ClaudeCliProvider {
  name = "claude-cli";
  private model: string;

  constructor(config?: { model?: string }) {
    this.model = config?.model || process.env.CLAUDE_CLI_MODEL || "claude-sonnet-4-5";
  }

  async complete(
    messages: Message[],
    _tools?: Tool[],
    _config?: LLMConfig,
  ): Promise<LLMResponse> {
    const cmd = Bun.which("claude");
    if (!cmd) {
      throw new Error("Claude CLI is not installed. Install Claude CLI and run '/connect'.");
    }

    const p = prompt(messages);
    const tries = [
      [cmd, "-m", this.model, "-p", p],
      [cmd, "-m", this.model, "--print", p],
    ];

    for (const args of tries) {
      const out = await run(args);
      if (out.code === 0 && out.stdout) return { content: out.stdout };
    }

    const last = await run(tries[tries.length - 1]);
    const msg = last.stderr || last.stdout || "Unknown Claude CLI error";
    throw new Error(`Claude CLI auth/inference failed: ${msg}`);
  }

  async *stream(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): AsyncGenerator<LLMResponse> {
    const out = await this.complete(messages, tools, config);
    if (!out.content) {
      yield { content: "", tool_calls: out.tool_calls, usage: out.usage };
      return;
    }
    for (let i = 0; i < out.content.length; i += 120) {
      yield { content: out.content.slice(i, i + 120) };
    }
    if (out.tool_calls?.length) {
      yield { content: "", tool_calls: out.tool_calls };
    }
  }
}
