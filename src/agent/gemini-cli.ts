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

async function runStream(
  args: string[],
  onChunk: (chunk: string) => void,
): Promise<{ code: number; stderr: string; sawOutput: boolean }> {
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const reader = proc.stdout?.getReader();
  const decoder = new TextDecoder();
  let sawOutput = false;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;
      sawOutput = true;
      onChunk(chunk);
    }
  }

  const code = await proc.exited;
  const stderr = (await new Response(proc.stderr).text()).trim();
  return { code, stderr, sawOutput };
}

export class GeminiCliProvider {
  name = "gemini-cli";
  private model: string;

  constructor(config?: { model?: string }) {
    this.model = config?.model || process.env.GEMINI_CLI_MODEL || "gemini-2.5-pro";
  }

  async complete(
    messages: Message[],
    _tools?: Tool[],
    _config?: LLMConfig,
  ): Promise<LLMResponse> {
    const cmd = Bun.which("gemini");
    if (!cmd) {
      throw new Error("Gemini CLI is not installed. Install Gemini CLI and run '/connect'.");
    }

    const p = prompt(messages);
    const tries = [
      [cmd, "-m", this.model, "-p", p],
      [cmd, "-m", this.model, "--prompt", p],
    ];

    for (const args of tries) {
      const out = await run(args);
      if (out.code === 0 && out.stdout) return { content: out.stdout };
    }

    const last = await run(tries[tries.length - 1]);
    const msg = last.stderr || last.stdout || "Unknown Gemini CLI error";
    throw new Error(`Gemini CLI auth/inference failed: ${msg}`);
  }

  async *stream(
    messages: Message[],
    _tools?: Tool[],
    _config?: LLMConfig,
  ): AsyncGenerator<LLMResponse> {
    const cmd = Bun.which("gemini");
    if (!cmd) {
      throw new Error("Gemini CLI is not installed. Install Gemini CLI and run '/connect'.");
    }

    const p = prompt(messages);
    const tries = [
      [cmd, "-m", this.model, "--stream", "-p", p],
      [cmd, "-m", this.model, "--stream", "--prompt", p],
      [cmd, "-m", this.model, "-p", p],
      [cmd, "-m", this.model, "--prompt", p],
    ];

    let lastError = "Unknown Gemini CLI error";

    for (const args of tries) {
      const chunks: string[] = [];
      const out = await runStream(args, (chunk) => {
        chunks.push(chunk);
      });

      if (out.code === 0 && out.sawOutput) {
        for (const chunk of chunks) {
          if (chunk) yield { content: chunk };
        }
        return;
      }

      if (out.code !== 0) {
        lastError = out.stderr || lastError;
      }
    }

    throw new Error(`Gemini CLI auth/inference failed: ${lastError}`);
  }
}
