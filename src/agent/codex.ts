import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMConfig, LLMResponse, Message, Tool } from "../llm/types.js";

function prompt(messages: Message[]) {
  return messages
    .map((msg) => `${msg.role.toUpperCase()}:\n${msg.content}`)
    .join("\n\n");
}

export class CodexProvider {
  name = "chatgpt-codex";
  private model: string;

  constructor(config?: { model?: string }) {
    this.model = config?.model || process.env.CHATGPT_CODEX_MODEL || "gpt-5-codex";
  }

  async complete(
    messages: Message[],
    _tools?: Tool[],
    config?: LLMConfig,
  ): Promise<LLMResponse> {
    const cmd = Bun.which("codex");
    if (!cmd) {
      throw new Error("Codex CLI is not installed. Install Codex and run '/connect'.");
    }

    const dir = await mkdtemp(join(tmpdir(), "dax-codex-"));
    const out = join(dir, "last-message.txt");
    const model = config?.model || this.model;
    const args = [
      cmd,
      "-a",
      "never",
      "-s",
      "read-only",
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-C",
      process.cwd(),
      "-m",
      model,
      "-o",
      out,
      prompt(messages),
    ];

    try {
      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });
      const code = await proc.exited;

      if (code !== 0) {
        const stderr = await new Response(proc.stderr).text();
        const stdout = await new Response(proc.stdout).text();
        const lines = `${stderr}\n${stdout}`
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const last = lines[lines.length - 1] || "Unknown Codex CLI error";
        throw new Error(`Codex subscription auth/inference failed: ${last}`);
      }

      const content = (await readFile(out, "utf8")).trim();
      return { content };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
