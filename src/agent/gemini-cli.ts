import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { LLMConfig, LLMResponse, Message, Tool } from "../llm/types.js";

function prompt(messages: Message[]) {
  return messages.map((msg) => `${msg.role.toUpperCase()}:\n${msg.content}`).join("\n\n");
}

function parseJson(line: string) {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sensitive(key: string) {
  return /token|secret|password|api[_-]?key|access[_-]?key|authorization|bearer|session|refresh/i.test(key);
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((row) => redact(row));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, row]) => [
      key,
      sensitive(key) ? "REDACTED" : redact(row),
    ]),
  );
}

function debugOn() {
  return (process.env.DAX_DEBUG_STREAM || "").toLowerCase() === "true";
}

function debugRawOn() {
  return (process.env.DAX_DEBUG_STREAM_RAW || "").toLowerCase() === "true";
}

function debugMaxEvents() {
  const n = parseInt(process.env.DAX_DEBUG_STREAM_MAX_EVENTS || "3", 10);
  if (!Number.isFinite(n) || n <= 0) return 3;
  return Math.min(20, n);
}

function debugLine(msg: string) {
  if (!debugOn()) return;
  process.stderr.write(`stream-debug: ${msg}\n`);
}

function debugRaw(row: Record<string, unknown>) {
  if (!debugOn() || !debugRawOn()) return;
  const text = JSON.stringify(redact(row));
  const clipped = text.length > 500 ? `${text.slice(0, 500)}...` : text;
  process.stderr.write(`stream-debug-raw: ${clipped}\n`);
}

function eventType(row: Record<string, unknown>) {
  const type = row.type || row.event || row.kind || row.event_type;
  return typeof type === "string" ? type : "unknown";
}

function textFromEvent(row: Record<string, unknown>) {
  if (typeof row.text === "string") return row.text;

  const delta = row.delta as Record<string, unknown> | undefined;
  if (delta && typeof delta.text === "string") return delta.text;

  const content = row.content as Record<string, unknown> | undefined;
  if (content && typeof content.text === "string") return content.text;

  const message = row.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === "string") return message.content;
  if (message && typeof message.text === "string") return message.text;

  const chunk = row.chunk as Record<string, unknown> | undefined;
  if (chunk && typeof chunk.text === "string") return chunk.text;

  const data = row.data as Record<string, unknown> | undefined;
  if (data && typeof data.text === "string") return data.text;

  const toolResult = row.tool_result as Record<string, unknown> | undefined;
  if (toolResult && typeof toolResult.output === "string") return toolResult.output;
  if (toolResult && toolResult.output && typeof toolResult.output === "object") {
    const output = toolResult.output as Record<string, unknown>;
    if (typeof output.text === "string") return output.text;
  }

  const result = row.result as Record<string, unknown> | undefined;
  if (result && typeof result.text === "string") return result.text;
  if (result && typeof result.response === "string") return result.response;
  if (result && result.response && typeof result.response === "object" && typeof (result.response as Record<string, unknown>).text === "string") {
    return (result.response as Record<string, unknown>).text as string;
  }

  const response = row.response as Record<string, unknown> | undefined;
  const responseCandidates = response?.candidates as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(responseCandidates)) {
    const text = responseCandidates
      .map((item) => {
        const c = item.content as Record<string, unknown> | undefined;
        const p = c?.parts as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(p)) return "";
        return p
          .map((part) => part.text)
          .filter((part): part is string => typeof part === "string")
          .join("");
      })
      .join("");
    if (text) return text;
  }

  const candidate = row.candidate as Record<string, unknown> | undefined;
  const candidateContent = candidate?.content as Record<string, unknown> | undefined;
  const parts = candidateContent?.parts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(parts)) {
    const text = parts
      .map((part) => part.text)
      .filter((part): part is string => typeof part === "string")
      .join("");
    if (text) return text;
  }

  const candidates = row.candidates as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(candidates)) {
    const text = candidates
      .map((item) => {
        const c = item.content as Record<string, unknown> | undefined;
        const p = c?.parts as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(p)) return "";
        return p
          .map((part) => part.text)
          .filter((part): part is string => typeof part === "string")
          .join("");
      })
      .join("");
    if (text) return text;
  }

  return "";
}

function normalizeError(stderr: string, stdout = "") {
  const all = `${stderr}\n${stdout}`.toLowerCase();
  if (/no payment method|credits|billing/.test(all)) {
    return "Gemini CLI requires billing/credits. Check provider billing settings.";
  }
  if (/unauthorized|401|forbidden|403|login|auth/.test(all)) {
    return "Gemini CLI auth required. Run '/connect' and login again.";
  }
  return stderr || stdout || "Unknown Gemini CLI error";
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

async function runNdjson(
  args: string[],
  onText: (text: string) => void,
): Promise<{ code: number; stderr: string; sawOutput: boolean }> {
  debugLine(`mode=stream-json cmd=${args[0]} model=${args[2] || "unknown"}`);
  const proc = spawn(args[0], args.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let sawOutput = false;
  let stderr = "";
  let idx = 0;
  let lastText = "";
  const max = debugMaxEvents();
  const seenTypes = new Set<string>();
  const fingerprint = new Set<string>();

  if (proc.stderr) {
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
  }

  if (proc.stdout) {
    const rl = createInterface({ input: proc.stdout });
    await new Promise<void>((resolve) => {
      rl.on("line", (line) => {
        const row = parseJson(line.trim());
        if (!row) return;

        idx += 1;
        const type = eventType(row);
        const keys = Object.keys(row).sort();
        if (type === "init") {
          const session = typeof row.session_id === "string" ? row.session_id : "unknown";
          const model = typeof row.model === "string" ? row.model : "unknown";
          debugLine(`init session=${session} model=${model}`);
        }
        if (type === "error") {
          debugLine("event=error");
        }
        const text = textFromEvent(row);
        const textLen = text.length;
        fingerprint.add(`type:${type}|keys:${keys.join(",")}`);

        if (seenTypes.size < max || idx <= max) {
          if (!seenTypes.has(type) || idx <= max) {
            debugLine(`idx=${idx} type=${type} keys=[${keys.join(",")}] text=+${textLen}`);
            debugRaw(row);
          }
          seenTypes.add(type);
        }

        if (!text) return;
        const delta = text.startsWith(lastText)
          ? text.slice(lastText.length)
          : lastText.endsWith(text)
            ? ""
            : text
        if (text.startsWith(lastText) && delta) {
          debugLine("mode=suffix cumulative=1")
        }
        if (delta) {
          sawOutput = true;
          onText(delta);
        }
        if (text.length >= lastText.length || text.startsWith(lastText)) {
          lastText = text;
          return;
        }
        if (delta) lastText += delta;
      });
      rl.on("close", () => resolve());
    });
  }

  if (fingerprint.size > 0) {
    debugLine(`fingerprint=${Array.from(fingerprint).slice(0, max).join(";")}`);
  }

  const code = await new Promise<number>((resolve) => {
    proc.on("close", (value) => resolve(value ?? 1));
  });

  return { code, stderr: stderr.trim(), sawOutput };
}

async function runRaw(
  args: string[],
  onText: (text: string) => void,
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
      const text = decoder.decode(value, { stream: true });
      if (!text) continue;
      sawOutput = true;
      onText(text);
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
    throw new Error(`Gemini CLI auth/inference failed: ${normalizeError(last.stderr, last.stdout)}`);
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
    const ndjson = [cmd, "-m", this.model, "-p", p, "--output-format", "stream-json"];
    const fallback = [
      [cmd, "-m", this.model, "-p", p],
      [cmd, "-m", this.model, "--prompt", p],
    ];

    const queue: string[] = []
    let done = false
    let wake: (() => void) | null = null
    const push = (text: string) => {
      if (!text) return
      queue.push(text)
      wake?.()
      wake = null
    }
    const drain = async function* () {
      while (!done || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }
        const next = queue.shift()
        if (next) yield next
      }
    }

    const ndjsonTask = runNdjson(ndjson, push)
      .finally(() => {
        done = true
        wake?.()
        wake = null
      })

    for await (const chunk of drain()) {
      yield { content: chunk }
    }

    const ndjsonOut = await ndjsonTask
    if (ndjsonOut.code === 0 && ndjsonOut.sawOutput) return

    let last = normalizeError(ndjsonOut.stderr)
    debugLine(`fallback=stdout reason=${last}`)

    for (const args of fallback) {
      const rawQueue: string[] = []
      let rawDone = false
      let rawWake: (() => void) | null = null
      const rawPush = (text: string) => {
        if (!text) return
        rawQueue.push(text)
        rawWake?.()
        rawWake = null
      }
      const rawDrain = async function* () {
        while (!rawDone || rawQueue.length > 0) {
          if (rawQueue.length === 0) {
            await new Promise<void>((resolve) => {
              rawWake = resolve
            })
            continue
          }
          const next = rawQueue.shift()
          if (next) yield next
        }
      }
      const rawTask = runRaw(args, rawPush)
        .finally(() => {
          rawDone = true
          rawWake?.()
          rawWake = null
        })
      for await (const chunk of rawDrain()) {
        yield { content: chunk }
      }
      const out = await rawTask
      if (out.code === 0 && out.sawOutput) return
      last = normalizeError(out.stderr)
    }

    throw new Error(`Gemini CLI auth/inference failed: ${last}`)
  }

}
