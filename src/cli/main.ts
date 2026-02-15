#!/usr/bin/env bun

import { createAgent } from "../agent/index.js";
import {
  getDefaultProvider,
  createProvider,
  isLocalModelAvailable,
  detectLocalModels,
} from "../llm/index.js";
import { createToolRegistry, createLocalRegistry } from "../tools/index.js";
import { parseArgs } from "util";
import { dirname, join, resolve } from "path";
import { createInterface } from "node:readline";
import { mkdir } from "node:fs/promises";
import {
  authenticateGemini,
  getGeminiOAuthConfig,
  syncGeminiEnv,
} from "../auth/gemini.js";
import { ChatGPTProvider } from "../agent/chatgpt.js";
import { GeminiProvider } from "../agent/gemini.js";
import { CodexProvider } from "../agent/codex.js";
import { GeminiCliProvider } from "../agent/gemini-cli.js";
import { ClaudeCliProvider } from "../agent/claude-cli.js";
import { resolveFallbackProvider } from "./fallback.js";
import { isPolicyName, policyConfig, type PolicyName } from "./policy.js";
import { clearGate, createUIState, setGate, setState, setTool } from "./uiState.js";
import { warnLegacyEnvOnce } from "./migrations.js";
import { getScopeTracker } from "../tools/validation.js";
import type { ToolCall } from "../llm/types.js";
import { initDb } from "../db/index.js";
import { diffKeys, formatPMEventRow, redacted, safeJsonPreview } from "../pm/format.js";

interface CLIOptions {
  mode: "build" | "plan";
  provider: string;
  model?: string;
  workDir: string;
  task?: string;
  interactive: boolean;
  local: boolean;
  listModels: boolean;
}

const env = (name: string, legacy: string, fallback = "") => process.env[name] || process.env[legacy] || fallback;

const API_URL = env("DAX_API_URL", "COGNITO_API_URL", "http://localhost:4096/api");
const ORCHESTRATOR_ONLY = env("DAX_ORCHESTRATOR_ONLY", "COGNITO_ORCHESTRATOR_ONLY", "").toLowerCase() === "true";
const DEBUG_STARTUP = env("DAX_DEBUG_STARTUP", "COGNITO_DEBUG_STARTUP", "").toLowerCase() === "true";
const AUTH_CACHE_MS = parseInt(env("DAX_AUTH_CACHE_MS", "COGNITO_AUTH_CACHE_MS", "60000"), 10);
const CLI_STATUS_TIMEOUT_MS = parseInt(env("DAX_CLI_STATUS_TIMEOUT_MS", "COGNITO_CLI_STATUS_TIMEOUT_MS", "1200"), 10);
const HISTORY_LIMIT = parseInt(env("DAX_HISTORY_LIMIT", "COGNITO_HISTORY_LIMIT", "200"), 10);
const HISTORY_PATH = env("DAX_HISTORY_PATH", "COGNITO_HISTORY_PATH") || join(process.cwd(), ".dax", "history.txt");
const PIN_STATUS = env("DAX_PIN_STATUS", "COGNITO_PIN_STATUS", "true").toLowerCase() !== "false";
const ASSISTANT_NAME = env("DAX_ASSISTANT_NAME", "COGNITO_ASSISTANT_NAME", "DAX");
const SHOW_AUTO_NOTES = env("DAX_SHOW_AUTO_NOTES", "COGNITO_SHOW_AUTO_NOTES", "false").toLowerCase() === "true";
const UI_DENSE = env("DAX_UI_DENSE", "COGNITO_UI_DENSE", "false").toLowerCase() === "true";
const SCORE_PATH = env("DAX_SCORECARD_PATH", "COGNITO_SCORECARD_PATH") || join(process.cwd(), ".dax", "provider-scorecard.json");
const health = new Map<string, { value: string; ts: number }>();
let history: string[] | null = null;
let apiProcess: Bun.Subprocess | null = null;
let policy: PolicyName = isPolicyName((env("DAX_POLICY", "COGNITO_POLICY", "")).toLowerCase())
  ? (env("DAX_POLICY", "COGNITO_POLICY", "")).toLowerCase() as PolicyName
  : "balanced";
let scorecard: Record<string, { ok: number; err: number; fallback: number; last_ok?: string; last_err?: string }> | null = null;
const ui = createUIState();

function isAdapterProvider(name: string) {
  return ["chatgpt-codex", "gemini-cli", "claude-cli", "ollama", "phi3"].includes(name);
}

function providerNames() {
  const names = [
    "ollama",
    "openai",
    "chatgpt-codex",
    "chatgpt-plus",
    "chatgpt-subscription",
    "chatgpt-api",
    "gemini-cli",
    "gemini",
    "claude-cli",
    "anthropic",
  ];
  return ORCHESTRATOR_ONLY ? names.filter((name) => isAdapterProvider(name)) : names;
}

function commandNames() {
  return [
    "/connect",
    "/provider",
    "/model",
    "/mode",
    "/status",
    "/doctor",
    "/policy",
    "/context",
    "/rao",
    "/pm",
    "/notes",
    "/help",
    "/clear",
    "/exit",
    "/quit",
  ];
}

function editDistance(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
        continue;
      }
      dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]) + 1;
    }
  }
  return dp[m][n];
}

function nearestCommand(input: string) {
  const base = input.replace(/^\//, "").toLowerCase();
  const options = commandNames().map((cmd) => cmd.replace(/^\//, ""));
  const scored = options.map((cmd) => ({ cmd, dist: editDistance(base, cmd) }));
  const hit = scored.sort((a, b) => a.dist - b.dist)[0];
  if (!hit) return null;
  if (hit.dist > 3) return null;
  return `/${hit.cmd}`;
}

function routeIntent(text: string) {
  const t = text.trim().toLowerCase();
  if (!t || t.startsWith("/")) return null;
  if (/plan first|let'?s plan first|start with a plan/.test(t)) {
    return "/mode plan";
  }
  if (/(switch|change|set).*(plan mode|mode to plan|to plan)|how.*switch.*plan/.test(t)) {
    return "/mode plan";
  }
  if (/(switch|change|set).*(build mode|mode to build|to build)/.test(t)) {
    return "/mode build";
  }
  if (/^(show|check|what'?s|what is).*status|^status$/.test(t)) {
    return "/status";
  }
  if (/^(show|check|what'?s|what is).*(context|scope)|^context$/.test(t)) {
    return "/context";
  }
  if (/^(help|show help|commands|what can you do)$/.test(t)) {
    return "/help";
  }
  if (/connect|login|authenticate/.test(t)) {
    if (/gemini/.test(t)) return "/provider gemini-cli";
    if (/claude/.test(t)) return "/provider claude-cli";
    if (/codex|chatgpt/.test(t)) return "/provider chatgpt-codex";
    return "/connect";
  }
  return null;
}

function completeInput(line: string) {
  const value = line.trimStart();
  if (!value.startsWith("/")) return [[], line] as [string[], string];

  if (value.startsWith("/provider ")) {
    const token = value.slice("/provider ".length).toLowerCase();
    const hits = providerNames()
      .filter((name) => name.startsWith(token))
      .map((name) => `/provider ${name}`);
    return [hits.length ? hits : providerNames().map((name) => `/provider ${name}`), line] as [string[], string];
  }

  if (value.startsWith("/mode ")) {
    const token = value.slice("/mode ".length).toLowerCase();
    const modes = ["build", "plan"];
    const hits = modes.filter((mode) => mode.startsWith(token)).map((mode) => `/mode ${mode}`);
    return [hits.length ? hits : modes.map((mode) => `/mode ${mode}`), line] as [string[], string];
  }

  if (value.startsWith("/policy ")) {
    const token = value.slice("/policy ".length).toLowerCase();
    const policies = ["safe", "balanced", "aggressive"];
    const hits = policies.filter((name) => name.startsWith(token)).map((name) => `/policy ${name}`);
    return [hits.length ? hits : policies.map((name) => `/policy ${name}`), line] as [string[], string];
  }

  const hits = commandNames().filter((cmd) => cmd.startsWith(value.toLowerCase()));
  return [hits.length ? hits : commandNames(), line] as [string[], string];
}

function startupTrace() {
  const t0 = performance.now();
  let prev = t0;
  return (phase: string) => {
    if (!DEBUG_STARTUP) return;
    const now = performance.now();
    const delta = (now - prev).toFixed(1);
    const total = (now - t0).toFixed(1);
    console.log(dim(`[startup] ${phase}: +${delta}ms (total ${total}ms)`));
    prev = now;
  };
}

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function accent(text: string) {
  return `${ansi.cyan}${text}${ansi.reset}`;
}

function ok(text: string) {
  return `${ansi.green}${text}${ansi.reset}`;
}

function warn(text: string) {
  return `${ansi.yellow}${text}${ansi.reset}`;
}

function err(text: string) {
  return `${ansi.red}${text}${ansi.reset}`;
}

function dim(text: string) {
  return `${ansi.dim}${text}${ansi.reset}`;
}

function bold(text: string) {
  return `${ansi.bold}${text}${ansi.reset}`;
}

function kbd(text: string) {
  return `${ansi.bold}${text}${ansi.reset}`;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query = "") {
  const q = query.trim();
  if (!q) return text;
  return text.replace(new RegExp(`(${escapeRegExp(q)})`, "ig"), `${ansi.bold}${ansi.cyan}$1${ansi.reset}`);
}

function hasCodex() {
  return Boolean(Bun.which("codex"));
}

function hasGeminiCli() {
  return Boolean(Bun.which("gemini"));
}

async function geminiOAuthCacheStatus() {
  const home = process.env.HOME || "";
  if (!home) return { ready: false, reason: "Gemini CLI login required" };
  const file = Bun.file(join(home, ".gemini", "oauth_creds.json"));
  if (!(await file.exists())) {
    return { ready: false, reason: "Gemini CLI login required" };
  }
  try {
    const data = await file.json() as {
      access_token?: string;
      refresh_token?: string;
      expiry_date?: number | string;
    };
    const expiry = typeof data.expiry_date === "string"
      ? parseInt(data.expiry_date, 10)
      : data.expiry_date || 0;
    if (data.access_token && expiry > Date.now() + 60_000) {
      return { ready: true, reason: "ready" };
    }
    if (data.refresh_token) {
      return { ready: true, reason: "ready" };
    }
    return { ready: false, reason: "Gemini CLI login required" };
  } catch {
    return { ready: false, reason: "Gemini CLI login required" };
  }
}

function hasClaudeCli() {
  return Boolean(Bun.which("claude"));
}

async function geminiCliStatus() {
  if (!hasGeminiCli()) return { ready: false, reason: "Gemini CLI not installed" };
  const cached = await geminiOAuthCacheStatus();
  if (cached.ready) return cached;
  const cmd = Bun.which("gemini")!;
  const bad = /not logged(?:\s*in)?|not authenticated|login required|set an auth method|please login|authenticate/i;
  const probes = [
    [cmd, "auth", "status"],
    [cmd, "login", "status"],
  ];
  for (const args of probes) {
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const code = await Promise.race([
      proc.exited,
      Bun.sleep(CLI_STATUS_TIMEOUT_MS).then(() => -999),
    ]);
    if (code === -999) {
      proc.kill();
      return { ready: false, reason: "Gemini CLI status timed out" };
    }
    const stdout = (await new Response(proc.stdout).text()).trim();
    const stderr = (await new Response(proc.stderr).text()).trim();
    const text = `${stdout}\n${stderr}`.toLowerCase();
    if (code === 0 && !bad.test(text)) {
      return { ready: true, reason: "ready" };
    }
    if (bad.test(text)) {
      return { ready: false, reason: "Gemini CLI login required" };
    }
  }
  return { ready: false, reason: "Gemini CLI login required" };
}

async function claudeCliStatus() {
  if (!hasClaudeCli()) return { ready: false, reason: "Claude CLI not installed" };
  const cmd = Bun.which("claude")!;
  const probes = [
    [cmd, "auth", "status"],
    [cmd, "status"],
  ];
  for (const args of probes) {
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const code = await Promise.race([
      proc.exited,
      Bun.sleep(CLI_STATUS_TIMEOUT_MS).then(() => -999),
    ]);
    if (code === -999) {
      proc.kill();
      return { ready: false, reason: "Claude CLI status timed out" };
    }
    const stdout = (await new Response(proc.stdout).text()).trim();
    const stderr = (await new Response(proc.stderr).text()).trim();
    const text = `${stdout}\n${stderr}`.toLowerCase();
    if (code === 0 && !/not logged|not authenticated|login required|please login/i.test(text)) {
      return { ready: true, reason: "ready" };
    }
    if (/not logged|not authenticated|login required|please login/i.test(text)) {
      return { ready: false, reason: "Claude CLI login required" };
    }
  }
  return { ready: false, reason: "Unable to verify Claude CLI login status" };
}

async function codexLoginStatus() {
  if (!hasCodex()) return false;
  const proc = Bun.spawn([Bun.which("codex")!, "login", "status"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await Promise.race([
    proc.exited,
    Bun.sleep(CLI_STATUS_TIMEOUT_MS).then(() => -999),
  ]);
  if (code === -999) {
    proc.kill();
    return false;
  }
  const text = await new Response(proc.stdout).text();
  return code === 0 && /logged in|authenticated|active/i.test(text);
}

async function codexDeviceLogin() {
  if (!hasCodex()) {
    throw new Error("Codex CLI is not installed. Install Codex first.");
  }
  if (await codexLoginStatus()) {
    return;
  }
  const proc = Bun.spawn([Bun.which("codex")!, "login", "--device-auth"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error("Codex login failed.");
  }
}

async function geminiCliLogin() {
  if (!hasGeminiCli()) {
    throw new Error("Gemini CLI is not installed. Install Gemini CLI first.");
  }
  const current = await geminiCliStatus();
  if (current.ready) return;
  throw new Error(
    "Gemini CLI login is interactive in this version. Run `gemini`, then `/auth`, then `exit`, and run /connect again.",
  );
}

async function claudeCliLogin() {
  if (!hasClaudeCli()) {
    throw new Error("Claude CLI is not installed. Install Claude CLI first.");
  }
  const status = await claudeCliStatus();
  if (status.ready) return;
  const proc = Bun.spawn([Bun.which("claude")!, "login"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error("Claude CLI login failed.");
  }
}

function openaiKey() {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.CHATGPT_PLUS_API_KEY?.trim() ||
    ""
  );
}

async function startDeviceFlow(provider: "openai" | "google") {
  await ensureApiReady();
  const endpoint =
    provider === "openai"
      ? process.env.CHATGPT_SUBSCRIPTION_DEVICE_CODE_URL?.trim() || `${API_URL}/oauth/device/code`
      : process.env.GEMINI_SUBSCRIPTION_DEVICE_CODE_URL?.trim() || `${API_URL}/oauth/device/code`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      client_id: "dax-cli",
      scope: provider === "openai" ? "chatgpt.subscription" : "gemini.subscription",
    }),
  });
  if (!response.ok) {
    throw new Error(`Device flow start failed (${response.status})`);
  }
  return await response.json();
}

async function ensureApiReady() {
  const healthUrl = `${API_URL}/health`;
  try {
    const response = await fetch(healthUrl);
    if (response.ok) return;
  } catch {}

  if (!apiProcess) {
    const bunBin = process.execPath || Bun.which("bun") || "bun";
    const port = (() => {
      try {
        const url = new URL(API_URL);
        return url.port || "4096";
      } catch {
        return "4096";
      }
    })();
    console.log(dim(`ℹ API not reachable at ${healthUrl}. Starting local API server...`));
    apiProcess = Bun.spawn([bunBin, "src/server.ts"], {
      cwd: process.cwd(),
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        PORT: port,
      },
    });
  }

  for (let i = 0; i < 15; i++) {
    await Bun.sleep(200);
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {}
  }

  throw new Error(
    `Unable to connect to API at ${healthUrl}. Run 'npm run start:api' and try /connect again.`,
  );
}

async function waitForDeviceToken(
  provider: "openai" | "google",
  deviceCode: string,
  interval: number,
  expiresIn: number,
) {
  const endpoint =
    provider === "openai"
      ? process.env.CHATGPT_SUBSCRIPTION_TOKEN_URL?.trim() || `${API_URL}/oauth/token`
      : process.env.GEMINI_SUBSCRIPTION_TOKEN_URL?.trim() || `${API_URL}/oauth/token`;
  const started = Date.now();
  while ((Date.now() - started) / 1000 < expiresIn) {
    await Bun.sleep(Math.max(1, interval) * 1000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: "dax-cli",
      }),
    });
    const data = await response.json();
    if (response.ok && data.access_token) return data;
    if (data.error === "authorization_pending") continue;
    throw new Error(data.error || "Device flow failed");
  }
  throw new Error("Device flow timed out");
}

function parseCliArgs(): CLIOptions {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      mode: {
        type: "string",
        default: "build",
        short: "m",
      },
      provider: {
        type: "string",
        default: "auto",
        short: "p",
      },
      model: {
        type: "string",
        short: "M",
      },
      dir: {
        type: "string",
        default: ".",
        short: "d",
      },
      interactive: {
        type: "boolean",
        default: false,
        short: "i",
      },
      local: {
        type: "boolean",
        default: false,
        short: "l",
      },
      "list-models": {
        type: "boolean",
        default: false,
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
  });

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const mode = values.mode as "build" | "plan";
  if (mode !== "build" && mode !== "plan") {
    console.error(`Error: Invalid mode "${mode}". Use "build" or "plan".`);
    process.exit(1);
  }

  return {
    mode,
    provider: values.provider as string,
    model: values.model as string | undefined,
    workDir: resolve(values.dir as string),
    task: positionals.join(" ") || undefined,
    interactive: values.interactive as boolean,
    local: values.local as boolean,
    listModels: values["list-models"] as boolean,
  };
}

function showHelp() {
  console.log(`
🧠 DAX - Decision-Aware AI Coding Agent

Usage: dax [options] [task]

Options:
  -m, --mode <build|plan>     Agent mode (default: build)
  -p, --provider <name>       LLM provider: openai, anthropic, ollama, chatgpt-codex, chatgpt-plus, chatgpt-subscription, chatgpt-api, gemini, gemini-cli, claude-cli (default: auto)
  -M, --model <name>          Model name (e.g., gpt-4, phi3:mini-128k)
  -d, --dir <path>            Working directory (default: current)
  -i, --interactive           Interactive mode
  -l, --local                 Force local model (Phi3)
  --list-models               List available local models
  -h, --help                  Show this help

Examples:
  # Quick start with local Phi3
  dax -l "Refactor auth middleware"

  # Analyze codebase structure
  dax -l -m plan "Analyze src/ directory"

  # Scaffold a new TypeScript project
  dax -l "Create a TypeScript API project called my-api"

  # Generate tests
  dax -l "Generate tests for src/utils.ts"

  # Interactive session
  dax -l -i

  # Use cloud provider
  dax -p openai "Your task here"

  # Use specific model
  dax -p ollama -M phi3:mini-128k "Your task"

Provider Priority:
  1. Local (Phi3:mini-128k) - if Ollama is running
  2. ChatGPT Plus (subscription/api) - if CHATGPT_SUBSCRIPTION_TOKEN or API key is set
  3. Gemini OAuth - if GOOGLE_ACCESS_TOKEN or refresh credentials are set
  4. ChatGPT Codex - if Codex CLI is authenticated
  5. Gemini CLI - if Gemini CLI is authenticated
  6. Claude CLI - if Claude CLI is authenticated
  7. OpenAI - if OPENAI_API_KEY is set
  8. Anthropic - if ANTHROPIC_API_KEY is set

Environment Variables:
  OPENAI_API_KEY         OpenAI API key
  CHATGPT_PLUS_API_KEY   ChatGPT Plus/OpenAI API key alias
  CHATGPT_SUBSCRIPTION_TOKEN ChatGPT device-flow session token
  CHATGPT_SUBSCRIPTION_BRIDGE_URL Subscription bridge endpoint
  CHATGPT_CODEX_MODEL      Codex model override (default: gpt-5-codex)
  CHATGPT_SUBSCRIPTION_DEVICE_CODE_URL Optional device-code endpoint for external bridge
  CHATGPT_SUBSCRIPTION_TOKEN_URL Optional token-poll endpoint for external bridge
  GEMINI_CLI_MODEL         Gemini CLI model override
  CLAUDE_CLI_MODEL         Claude CLI model override
  DAX_ORCHESTRATOR_ONLY (legacy: COGNITO_ORCHESTRATOR_ONLY) Restrict providers to CLI adapters + local models
  DAX_ASSISTANT_NAME (legacy: COGNITO_ASSISTANT_NAME)    Assistant display name in TUI (default: DAX)
  DAX_SHOW_AUTO_NOTES (legacy: COGNITO_SHOW_AUTO_NOTES)   Show work notes automatically (default: false)
  DAX_UI_DENSE (legacy: COGNITO_UI_DENSE)          Compact spacing preset for smaller terminals (default: false)
  DAX_PIN_STATUS (legacy: COGNITO_PIN_STATUS)       Pin status line to terminal footer (default: true)
  DAX_CLI_STATUS_TIMEOUT_MS (legacy: COGNITO_CLI_STATUS_TIMEOUT_MS) Timeout for external CLI status probes (default: 1200)
  DAX_HISTORY_PATH (legacy: COGNITO_HISTORY_PATH)     Prompt history file path (default: ./.dax/history.txt)
  DAX_HISTORY_LIMIT (legacy: COGNITO_HISTORY_LIMIT)    Max prompt history entries (default: 200)
  ANTHROPIC_API_KEY      Anthropic API key
  GOOGLE_ACCESS_TOKEN    Google/Gemini Access Token
  GOOGLE_CLIENT_ID       Google OAuth Client ID
  GOOGLE_CLIENT_SECRET   Google OAuth Client Secret
  GOOGLE_PROJECT_ID      Google Cloud Project ID
  GEMINI_OAUTH_CLIENT_ID Gemini OAuth Client ID alias
  GEMINI_OAUTH_CLIENT_SECRET Gemini OAuth Client Secret alias
  GEMINI_PROJECT_ID      Gemini Project ID alias
  OLLAMA_HOST            Ollama host URL (default: http://localhost:11434)
`);
}

async function listLocalModels() {
  console.log("🔍 Checking for local models...\n");

  try {
    const models = await detectLocalModels();

    if (models.length === 0) {
      console.log("❌ No local models found. Make sure Ollama is running.");
      console.log("\nTo install Phi3:mini-128k:");
      console.log("  ollama pull phi3:mini-128k");
    } else {
      console.log("✅ Available local models:");
      models.forEach((model) => {
        const recommended = model === "phi3:mini-128k" ? " (recommended)" : "";
        console.log(`  - ${model}${recommended}`);
      });
    }
  } catch (error) {
    console.log("❌ Could not connect to Ollama.");
    console.log("Make sure Ollama is installed and running:");
    console.log("  https://ollama.ai");
  }
}

async function getProvider(options: CLIOptions) {
  if (ORCHESTRATOR_ONLY && options.provider !== "auto" && !isAdapterProvider(options.provider)) {
    throw new Error(
      `Provider '${options.provider}' is disabled in orchestrator-only mode. Use chatgpt-codex, gemini-cli, claude-cli, ollama, or phi3.`,
    );
  }

  // Force local if -l flag is set
  if (options.local) {
    console.log("🤖 Using local Phi3:mini-128k model");
    return createProvider("phi3", { model: "phi3:mini-128k" });
  }

  // Auto-detect
  if (options.provider === "auto") {
    const subscriptionToken = (process.env.CHATGPT_SUBSCRIPTION_TOKEN || "").trim();
    if (subscriptionToken) {
      return new ChatGPTProvider({
        apiKey: openaiKey(),
        model: options.model,
        mode: "subscription",
      });
    }

    if (openaiKey()) {
      return new ChatGPTProvider({
        apiKey: openaiKey(),
        model: options.model,
        mode: "api",
      });
    }

    syncGeminiEnv();
    const gemini = getGeminiOAuthConfig();
    if (gemini.accessToken || (gemini.clientId && gemini.refreshToken)) {
      // @ts-ignore
      return new GeminiProvider({
        accessToken: gemini.accessToken,
        model: options.model,
      });
    }

    // Probe CLI adapters only when fast env-based providers are unavailable.
    const [codexReady, geminiCli, claudeCli] = await Promise.all([
      hasCodex() ? codexLoginStatus() : Promise.resolve(false),
      geminiCliStatus(),
      claudeCliStatus(),
    ]);
    if (codexReady) {
      return new CodexProvider({ model: options.model });
    }
    if (geminiCli.ready) {
      return new GeminiCliProvider({ model: options.model });
    }
    if (claudeCli.ready) {
      return new ClaudeCliProvider({ model: options.model });
    }

    return getDefaultProvider();
  }

  if (options.provider === "gemini") {
    syncGeminiEnv();
    const config = getGeminiOAuthConfig();
    if (
      !config.accessToken &&
      (!config.clientId || !config.refreshToken)
    ) {
      throw new Error(
        "Gemini credentials are incomplete. Run '/connect' in interactive mode.",
      );
    }
    // @ts-ignore
    return new GeminiProvider({
      accessToken: config.accessToken,
      model: options.model,
    });
  }

  if (options.provider === "gemini-cli") {
    return new GeminiCliProvider({ model: options.model });
  }

  if (options.provider === "claude-cli") {
    return new ClaudeCliProvider({ model: options.model });
  }

  if (options.provider === "chatgpt-plus") {
    return new ChatGPTProvider({
      apiKey: openaiKey(),
      model: options.model,
      mode: "auto",
    });
  }

  if (options.provider === "chatgpt-codex") {
    return new CodexProvider({ model: options.model });
  }

  if (options.provider === "chatgpt-subscription") {
    return new ChatGPTProvider({
      apiKey: openaiKey(),
      model: options.model,
      mode: "subscription",
    });
  }

  if (options.provider === "chatgpt-api") {
    return new ChatGPTProvider({
      apiKey: openaiKey(),
      model: options.model,
      mode: "api",
    });
  }

  // Specific provider
  return createProvider(
    options.provider,
    options.model ? { model: options.model } : undefined,
  );
}

async function askQuestion(query: string): Promise<string> {
  const loaded = await loadHistory();
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    historySize: HISTORY_LIMIT,
    removeHistoryDuplicates: true,
    completer: query.trim().startsWith(">") ? completeInput : undefined,
  });
  (rl as unknown as { history: string[] }).history = [...loaded];

  return new Promise<string>((resolve) => {
    rl.question(query, (answer) => {
      const value = answer.trim();
      if (value) {
        history = [value, ...loaded.filter((item) => item !== value)].slice(0, HISTORY_LIMIT);
        saveHistory();
      }
      rl.close();
      resolve(answer);
    });
  });
}

async function saveEnv(key: string, value: string) {
  const envPath = resolve(process.cwd(), ".env");
  const file = Bun.file(envPath);
  let content = "";

  if (await file.exists()) {
    content = await file.text();
  }

  if (content.includes(`${key}=`)) {
    content = content.replace(new RegExp(`${key}=.*`), `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }

  await Bun.write(envPath, content);
  console.log(`✅ Saved ${key} to .env`);
}

async function loadScorecard() {
  if (scorecard) return scorecard;
  const file = Bun.file(SCORE_PATH);
  if (!(await file.exists())) {
    scorecard = {};
    return scorecard;
  }
  try {
    scorecard = await file.json();
    return scorecard || {};
  } catch {
    scorecard = {};
    return scorecard;
  }
}

async function saveScorecard() {
  const data = await loadScorecard();
  await mkdir(dirname(SCORE_PATH), { recursive: true });
  await Bun.write(SCORE_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

async function recordProvider(name: string, event: "ok" | "err" | "fallback") {
  const data = await loadScorecard();
  const row = data[name] || { ok: 0, err: 0, fallback: 0 };
  if (event === "ok") {
    row.ok += 1;
    row.last_ok = new Date().toISOString();
  } else if (event === "err") {
    row.err += 1;
    row.last_err = new Date().toISOString();
  } else {
    row.fallback += 1;
  }
  data[name] = row;
  scorecard = data;
  await saveScorecard();
}

function setHealth(providerName: string, value: string) {
  health.set(providerName, { value, ts: Date.now() });
}

function clearHealth(providerName?: string) {
  if (!providerName) {
    health.clear();
    return;
  }
  health.delete(providerName);
}

async function showMenu(
  options: { label: string; value: string | null }[],
  query?: string,
): Promise<string | null> {
  let selected = 0;
  const { stdin, stdout } = process;

  // Hide cursor
  stdout.write("\x1b[?25l");

  const printMenu = () => {
    options.forEach((opt, i) => {
      const prefix = i === selected ? "👉 " : "   ";
      const style = i === selected ? `${ansi.bold}${ansi.cyan}` : ansi.gray;
      stdout.write(`${style}${prefix}${highlight(opt.label, query)}${ansi.reset}\n`);
    });
    stdout.write(
      `${ansi.dim}${kbd("↑/↓")} move  ${kbd("Enter")} select  ${kbd("Esc")} cancel${ansi.reset}\n`,
    );
  };

  const clearMenu = () => {
    stdout.write(`\x1b[${options.length + 1}A`); // Move up
    stdout.write("\x1b[0J"); // Clear down
  };

  printMenu();

  if (stdin.isTTY) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
  }

  return new Promise((resolve) => {
    const onData = (key: string) => {
      if (key === "\u0003") {
        // Ctrl+C
        cleanup();
        process.exit(0);
      }

      if (key === "\r" || key === "\n") {
        // Enter
        cleanup();
        resolve(options[selected].value);
        return;
      }

      if (key === "\u001b[A") {
        // Up
        selected = selected > 0 ? selected - 1 : options.length - 1;
        clearMenu();
        printMenu();
      }

      if (key === "\u001b[B") {
        // Down
        selected = selected < options.length - 1 ? selected + 1 : 0;
        clearMenu();
        printMenu();
      }

      if (key === "\u001b") {
        // Esc
        cleanup();
        resolve(null);
      }
    };

    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\x1b[?25h"); // Show cursor
      clearMenu();
    };

    stdin.on("data", onData);
  });
}

async function providerHealth(providerName: string, force = false) {
  const cached = health.get(providerName);
  if (!force && cached && Date.now() - cached.ts < AUTH_CACHE_MS) {
    return cached.value;
  }
  const save = (value: string) => {
    setHealth(providerName, value);
    return value;
  };
  if (providerName === "chatgpt-codex") {
    if (!force && !cached) return "auth unchecked";
    if (!hasCodex()) return save("codex-cli missing");
    return save((await codexLoginStatus()) ? "auth ok" : "login needed");
  }
  if (providerName === "gemini-cli") {
    if (!force && !cached) return "auth unchecked";
    const status = await geminiCliStatus();
    if (status.ready) return save("auth ok");
    if (/unknown|timed out/i.test(status.reason)) return save("status unknown");
    return save(status.reason);
  }
  if (providerName === "claude-cli") {
    if (!force && !cached) return "auth unchecked";
    const status = await claudeCliStatus();
    if (/timed out/i.test(status.reason)) return save("status unknown");
    return save(status.reason);
  }
  if (providerName === "chatgpt-subscription") {
    return save((process.env.CHATGPT_SUBSCRIPTION_TOKEN || "").trim()
      ? "token present"
      : "login needed");
  }
  if (providerName === "chatgpt-api" || providerName === "openai") {
    return save(openaiKey() ? "key present" : "key missing");
  }
  if (providerName === "gemini") {
    syncGeminiEnv();
    const config = getGeminiOAuthConfig();
    return save(config.accessToken || (config.clientId && config.refreshToken)
      ? "token/refresh present"
      : "login needed");
  }
  if (providerName === "anthropic") {
    return save(process.env.ANTHROPIC_API_KEY ? "key present" : "key missing");
  }
  return save("ok");
}

async function statusLineText(
  options: CLIOptions,
  provider: { name: string },
  force = false,
) {
  const model = activeModel(options, provider.name);
  const health = await providerHealth(provider.name, force);
  const authColor = /ok|present|ready/.test(health) ? ok(health) : /needed|missing|required|unable/.test(health) ? warn(health) : dim(health);
  const gate = !ui.lastGate
    ? "clean"
    : ui.lastGate.blocked
      ? "block"
      : "warn";
  const cwd = options.workDir.split("/").filter(Boolean).slice(-1)[0] || options.workDir;
  const sep = dim(" • ");
  return `${dim("─")} ${accent("provider")}:${bold(provider.name)}${sep}${accent("model")}:${bold(model)}${sep}${accent("mode")}:${bold(options.mode)}${sep}${accent("policy")}:${bold(policy)}${sep}${accent("state")}:${bold(ui.sessionState)}${sep}${accent("gate")}:${bold(gate)}${sep}${accent("auth")}:${authColor}${sep}${accent("cwd")}:${dim(cwd)} ${dim("─")}`;
}

function renderPinnedStatus(line: string) {
  if (!process.stdout.isTTY || !PIN_STATUS) return false;
  process.stdout.write("\x1b[s");
  process.stdout.write("\x1b[999;1H");
  process.stdout.write("\x1b[2K");
  process.stdout.write(line);
  process.stdout.write("\x1b[u");
  return true;
}

async function printStatusLine(
  options: CLIOptions,
  provider: { name: string },
  force = false,
) {
  const line = await statusLineText(options, provider, force);
  if (!renderPinnedStatus(line)) {
    console.log(line);
  }
}

function startDaxSpinner(label: string) {
  if (!process.stdout.isTTY) return () => {};
  const frames = ["◴", "◷", "◶", "◵"];
  let i = 0;
  const paint = () => {
    process.stdout.write(`\r${accent(bold("DAX"))} ${dim(frames[i % frames.length])} ${dim(label)}`);
    i++;
  };
  paint();
  const timer = setInterval(paint, 90);
  return () => {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
  };
}

async function withSpinner<T>(label: string, fn: () => Promise<T>) {
  const stop = startDaxSpinner(label);
  return await fn().finally(() => {
    stop();
  });
}

function styleInline(text: string) {
  return text
    .replace(/`([^`]+)`/g, `${ansi.yellow}$1${ansi.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${ansi.bold}$1${ansi.reset}`);
}

function colorCode(line: string, lang: string) {
  if (lang === "json") {
    return line
      .replace(/"([^"]+)"\s*:/g, `${ansi.cyan}"$1"${ansi.reset}:`)
      .replace(/:\s*"([^"]*)"/g, `: ${ansi.green}"$1"${ansi.reset}`)
      .replace(/\b(true|false|null)\b/g, `${ansi.yellow}$1${ansi.reset}`);
  }
  if (lang === "sh" || lang === "bash" || lang === "zsh") {
    return line
      .replace(/(^|\s)(\$ [^\n]+)/g, `$1${ansi.green}$2${ansi.reset}`)
      .replace(/(^|\s)(--?[a-zA-Z0-9-]+)/g, `$1${ansi.cyan}$2${ansi.reset}`);
  }
  if (["ts", "tsx", "js", "jsx"].includes(lang)) {
    return line
      .replace(/\b(const|let|function|return|if|else|await|async|import|from|export|class|new|try|catch|throw)\b/g, `${ansi.cyan}$1${ansi.reset}`)
      .replace(/"([^"]*)"/g, `${ansi.green}"$1"${ansi.reset}`)
      .replace(/'([^']*)'/g, `${ansi.green}'$1'${ansi.reset}`);
  }
  return line;
}

function renderDiff(text: string) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (/^\+\+\+|^---/.test(line)) {
      console.log(dim(line));
      continue;
    }
    if (line.startsWith("+")) {
      console.log(ok(line));
      continue;
    }
    if (line.startsWith("-")) {
      console.log(err(line));
      continue;
    }
    if (line.startsWith("@@")) {
      console.log(accent(line));
      continue;
    }
    console.log(line);
  }
}

function renderRich(text: string) {
  const lines = text.split("\n");
  let code = false;
  let lang = "";
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim().startsWith("```")) {
      code = !code;
      lang = code ? line.trim().slice(3).trim().toLowerCase() : "";
      if (code) console.log(dim(`┌ code${lang ? ` (${lang})` : ""}`));
      if (!code) console.log(dim("└ end"));
      continue;
    }
    if (code) {
      console.log(`${dim("│")} ${colorCode(line, lang)}`);
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      console.log(`${bold(accent(styleInline(line.replace(/^#{1,6}\s+/, ""))))}`);
      continue;
    }
    if (/^(\s*[-*]\s+)/.test(line)) {
      console.log(`${accent("•")} ${styleInline(line.replace(/^(\s*[-*]\s+)/, ""))}`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      console.log(styleInline(line));
      continue;
    }
    console.log(styleInline(line));
  }
}

function renderToolOutput(output: string) {
  if (/^diff --git|^@@|^\+\+\+|^---/m.test(output)) {
    renderDiff(output);
    return;
  }
  renderRich(output);
}

async function loadHistory() {
  if (history) return history;
  const file = Bun.file(HISTORY_PATH);
  if (!(await file.exists())) {
    history = [];
    return history;
  }
  const text = await file.text();
  history = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, HISTORY_LIMIT);
  return history;
}

async function saveHistory() {
  if (!history) return;
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await Bun.write(HISTORY_PATH, `${history.slice(0, HISTORY_LIMIT).join("\n")}\n`);
}

function activeModel(options: CLIOptions, providerName: string) {
  if (options.model) return options.model;
  if (providerName === "chatgpt-codex") return process.env.CHATGPT_CODEX_MODEL || "gpt-5-codex";
  if (providerName === "gemini-cli") return process.env.GEMINI_CLI_MODEL || "gemini-2.5-pro";
  if (providerName === "claude-cli") return process.env.CLAUDE_CLI_MODEL || "claude-sonnet-4-5";
  if (providerName === "chatgpt-plus" || providerName === "chatgpt-api" || providerName === "chatgpt-subscription") return "gpt-4o";
  if (providerName === "gemini") return "gemini-2.0-flash";
  if (providerName === "anthropic") return "claude-sonnet-4-20250514";
  if (providerName === "ollama" || providerName === "phi3") return "phi3:mini-128k";
  return "default";
}

function printCommandHelp() {
  console.log(`\n${bold("Commands")}:`);
  console.log(`  ${kbd("/connect")}      Connect/login provider`);
  console.log(`  ${kbd("/provider")}     Switch provider`);
  console.log(`  ${kbd("/model <id>")}   Set model for current session`);
  console.log(`  ${kbd("/mode <build|plan>")}`);
  console.log(`  ${kbd("/status")}       Show provider/model/auth status`);
  console.log(`  ${kbd("/doctor")}       Run provider preflight diagnostics`);
  console.log(`  ${kbd("/policy <safe|balanced|aggressive>")} Set orchestration policy`);
  console.log(`  ${kbd("/context")}      Show current task/scope context`);
  console.log(`  ${kbd("/rao [--json|clear|replay [n]|replay --json [n]|purge [--yes]]")} Show Run/Audit/Override status`);
  console.log(`  ${kbd("/pm undo")}      Undo last PM policy/config change`);
  console.log(`  ${kbd("/pm history [n]")} Show recent PM events`);
  console.log(`  ${kbd("/pm show <id>")}   Show PM event details`);
  console.log(`  ${kbd("/clear")}`);
  console.log(`  ${kbd("/exit")}`);
  if (ORCHESTRATOR_ONLY) {
    console.log(`\n${warn("Orchestrator-only mode is enabled")} (${kbd("DAX_ORCHESTRATOR_ONLY=true (legacy COGNITO_ORCHESTRATOR_ONLY=true)")}).`);
  }
  console.log("");
}

function renderAssistant(text: string) {
  if (UI_DENSE) {
    console.log(`\n${accent(bold(ASSISTANT_NAME))}`);
    renderRich(text);
    console.log("");
    return;
  }
  console.log(`\n${dim("┌")} ${accent(bold(ASSISTANT_NAME))}`);
  renderRich(text);
  console.log(`${dim("└")}\n`);
}

function toolTargets(call: ToolCall) {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(call.function.arguments || "{}")
  } catch {
    args = {}
  }
  const keys = ["path", "file", "target", "baseline_file", "proposed_file", "files"]
  return keys
    .map((key) => args[key])
    .flatMap((value) => {
      if (!value) return []
      if (typeof value === "string") return [value]
      if (Array.isArray(value)) return value.filter((row): row is string => typeof row === "string")
      return []
    })
}

function renderToolResults(
  results?: { success: boolean; output: string; error?: string }[],
  calls?: ToolCall[],
) {
  if (!results || results.length === 0) return;
  for (const [index, result] of results.entries()) {
    const call = calls?.[index]
    if (call) {
      const targets = toolTargets(call)
      setTool(ui, {
        name: call.function.name,
        targets,
        started_at: Date.now(),
      })
      console.log(dim(`→ tool: ${call.function.name}${targets.length > 0 ? ` ${targets.join(", ")}` : ""}`))
    }
    if (result.success) {
      console.log(ok("✓ ok"));
      renderToolOutput(result.output);
      if (!UI_DENSE) console.log("");
      continue;
    }
    console.log(err(`✗ failed: ${result.error || "Unknown tool error"}`));
  }
}

async function promptGateResolution(gate: { blocked: boolean; warnings: { kind: "never_touch" | "require_approval"; code: string; subject: string; message: string; matches?: string[] }[]; toolCalls: ToolCall[] }) {
  const stdin = process.stdin
  const stdout = process.stdout
  const inferPathPattern = () => {
    const files = gate.toolCalls.flatMap((call) => toolTargets(call))
    if (files.length === 0) return null
    if (files.length === 1) return files[0]
    const parts = files.map((file) => file.split("/").filter(Boolean))
    const min = Math.min(...parts.map((row) => row.length))
    const shared: string[] = []
    for (let i = 0; i < min; i++) {
      const head = parts[0][i]
      if (!parts.every((row) => row[i] === head)) break
      shared.push(head)
    }
    if (shared.length === 0) return null
    return `${shared.join("/")}/**`
  }
  const print = () => {
    console.log(`\n${warn("Approval required before execution:")}`)
    gate.warnings.forEach((line) => console.log(`- [${line.code}] ${line.message} (subject: ${line.subject})`))
    const options = gate.blocked
      ? "r=reject  v=view args  Esc=cancel"
      : "a=approve once  A=always allow  r=reject  v=view args  Esc=cancel"
    console.log(dim(options))
    if (gate.blocked) {
      console.log(warn("Blocked: restricted path policy triggered (never_touch)."))
      console.log(dim("To change policy, use /pm commands (or /pm undo if needed)."))
    }
  }
  if (!stdin.isTTY) return { action: "cancel" as const }
  const readKey = () => new Promise<string>((resolve) => {
    const onData = (key: string) => {
      stdin.removeListener("data", onData)
      resolve(key)
    }
    stdin.once("data", onData)
  })
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding("utf8")
  while (true) {
    print()
    const key = await readKey()
    if (gate.blocked && (key === "a" || key === "A")) {
      console.log(warn("This gate is blocked and cannot be approved from this prompt."))
      continue
    }
    if (key === "a" && !gate.blocked) {
      stdin.setRawMode(false)
      stdin.pause()
      return { action: "approve_once" as const }
    }
    if (key === "A" && !gate.blocked) {
      console.log(dim("Always allow as: t=tool, p=path pattern, Esc=cancel"))
      const next = await readKey()
      stdin.setRawMode(false)
      stdin.pause()
      if (next === "t") return { action: "always_allow_tool" as const }
      if (next === "p") {
        const pattern = inferPathPattern()
        if (!pattern) return { action: "cancel" as const }
        return { action: "always_allow_path" as const, pattern }
      }
      return { action: "cancel" as const }
    }
    if (key === "r") {
      stdin.setRawMode(false)
      stdin.pause()
      return { action: "reject" as const }
    }
    if (key === "\u001b") {
      stdin.setRawMode(false)
      stdin.pause()
      return { action: "cancel" as const }
    }
    if (key === "v") {
      stdout.write("\n")
      console.log(safeJsonPreview(gate.toolCalls, 1800))
      console.log(dim("…(truncated if large)"))
      continue
    }
  }
}

async function printContext(
  agent: {
    getWorkNotes: () => any
    getConversation: () => any[]
    getPMStateSummary: () => {
      risk: string
      verbosity: string
      never_touch: string[]
      always_allow: { kind: "tool" | "path"; pattern: string }[]
      recent_outcomes: { tool: string; success: boolean; summary: string }[]
    }
  },
  options: CLIOptions,
  provider: { name: string },
) {
  const auth = await providerHealth(provider.name);
  const rows = [
    ["provider", provider.name],
    ["model", activeModel(options, provider.name)],
    ["mode", options.mode],
    ["auth", auth],
    ["cwd", options.workDir],
    ["messages", String(agent.getConversation().length)],
  ];
  const width = Math.max(...rows.map((row) => row[0].length));
  console.log(`${UI_DENSE ? "" : "\n"}${bold("Context")}`);
  rows.forEach((row) => console.log(`${dim(row[0].padEnd(width))} : ${row[1]}`));
  const scope = getScopeTracker()?.getStatus()
  if (scope) {
    console.log(`${dim("scope_files".padEnd(width))} : ${scope.touchedFilesCount}/${scope.limits.maxFiles}`)
    console.log(`${dim("scope_loc".padEnd(width))} : ${scope.changedLoc}/${scope.limits.maxLoc}`)
  }
  const pm = agent.getPMStateSummary()
  console.log(`${dim("pm_risk".padEnd(width))} : ${pm.risk}`)
  console.log(`${dim("pm_verbosity".padEnd(width))} : ${pm.verbosity}`)
  console.log(`${dim("pm_never_touch".padEnd(width))} : ${pm.never_touch.length}`)
  console.log(`${dim("pm_always_allow".padEnd(width))} : ${pm.always_allow.length}`)
  if (pm.recent_outcomes.length > 0) {
    pm.recent_outcomes.slice(-3).forEach((row, i) => {
      console.log(
        `${dim(`pm_outcome_${i + 1}`.padEnd(width))} : ${row.tool} ${row.success ? "ok" : "err"} ${row.summary.slice(0, 80)}`,
      )
    })
  }
  const notes = agent.getWorkNotes();
  if (!notes) {
    console.log(`${dim("work_notes".padEnd(width))} : none`);
    if (!UI_DENSE) console.log("");
    return;
  }
  console.log(`${dim("intent".padEnd(width))} : ${notes.intent.what}`);
  console.log(`${dim("scope".padEnd(width))} : ${(notes.scope.files || []).slice(0, 5).join(", ") || "(none)"}`);
  console.log(`${dim("plan".padEnd(width))} : ${(notes.plan.steps || []).slice(0, 3).join(" -> ") || "(none)"}`);
  if (!UI_DENSE) console.log("");
}

function renderError(text: string) {
  console.log(`${err("Error:")} ${text}`);
  console.log(`${warn("⚠")} Session is still active. Use ${kbd("/connect")} or ${kbd("/provider")} to fix auth and continue.`);
}

function isGreeting(text: string) {
  return /^(hi|hello|hey|yo|hola|good (morning|afternoon|evening))([!. ]*)$/i.test(text.trim());
}

function looksTaskLike(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (
    /(as is|to be|gap analysis|tradeoff|pros and cons|discussion|let'?s discuss|what is|how can i|review this response)/.test(t) &&
    !/(create|build|implement|fix|refactor|write|generate|update|change|add|remove|optimize|test)\b/.test(t)
  ) {
    return false;
  }
  if (t.length > 40) return true;
  if (/(create|build|implement|fix|refactor|review|analyze|debug|write|generate|update|change|add|remove|optimize|test)\b/.test(t)) {
    return true;
  }
  if (/[`/]|\.ts|\.js|\.py|\.md|repo|project|code|file|folder/.test(t)) {
    return true;
  }
  return false;
}

async function providerChoices() {
  const rows = [
    { name: "ollama", label: "🤖 Ollama (Local)" },
    { name: "openai", label: "🧠 OpenAI" },
    { name: "chatgpt-codex", label: "🧩 ChatGPT via Codex CLI" },
    { name: "chatgpt-plus", label: "💎 ChatGPT Plus (Auto)" },
    { name: "chatgpt-subscription", label: "🔐 ChatGPT Subscription" },
    { name: "chatgpt-api", label: "🔑 ChatGPT API Key" },
    { name: "gemini-cli", label: "🌟 Gemini CLI" },
    { name: "gemini", label: "🌟 Gemini (OAuth)" },
    { name: "claude-cli", label: "🧠 Claude CLI" },
    { name: "anthropic", label: "🧠 Anthropic API" },
  ];
  const filtered = ORCHESTRATOR_ONLY
    ? rows.filter((row) => isAdapterProvider(row.name))
    : rows;
  const health = await Promise.all(filtered.map((row) => providerHealth(row.name)));
  return filtered.map((row, i) => ({
    label: `${row.label} [${health[i]}]`,
    value: `/provider ${row.name}`,
    raw: `${row.label} ${row.name} ${health[i]}`.toLowerCase(),
  }));
}

async function commandPalette(seed?: string) {
  const query = (seed ?? "").trim().toLowerCase();
  const base = [
    { label: "🔌 Connect Provider", value: "/connect", raw: "connect login auth provider" },
    { label: "📊 Status", value: "/status", raw: "status health" },
    { label: "🩺 Doctor", value: "/doctor", raw: "doctor diagnose preflight health auth" },
    { label: "🛡️ Policy", value: "/policy", raw: "policy safe balanced aggressive guardrail" },
    { label: "🧭 Context", value: "/context", raw: "context scope notes state" },
    { label: "🧩 RAO Status", value: "/rao", raw: "rao run audit override status" },
    { label: "🧾 RAO Replay", value: "/rao replay", raw: "rao replay history" },
    { label: "🗑️ RAO Purge", value: "/rao purge", raw: "rao purge history" },
    { label: "↩ PM Undo", value: "/pm undo", raw: "pm undo policy rollback" },
    { label: "🗂 PM History", value: "/pm history", raw: "pm history events" },
    { label: "🔎 PM Show", value: "/pm show", raw: "pm show event details" },
    { label: "🧬 Set Model", value: "/model", raw: "model set" },
    { label: "🏗️  Build Mode", value: "/mode build", raw: "mode build" },
    { label: "🧐 Plan Mode", value: "/mode plan", raw: "mode plan" },
    { label: "❓ Help", value: "/help", raw: "help commands" },
    { label: "🧹 Clear", value: "/clear", raw: "clear" },
    { label: "❌ Exit", value: "/exit", raw: "exit quit" },
  ];
  const providers = await providerChoices();
  const all = [...base, ...providers];
  if (!query) {
    return await showMenu([
      ...base.map((row) => ({ label: row.label, value: row.value })),
      { label: "🧠 Switch Provider", value: "/provider" },
      { label: "🔙 Cancel", value: null },
    ]);
  }
  if (query.startsWith("/")) return query;
  const hits = all.filter((row) => row.raw.includes(query));
  const fallback = hits.length > 0
    ? hits
    : all.filter((row) => row.raw.includes(query.slice(0, 3)));
  if (fallback.length === 0) {
    console.log(warn("No matching command. Try '/help'."));
    return null;
  }
  return await showMenu([
    ...fallback.map((row) => ({ label: row.label, value: row.value })),
    { label: "🔙 Cancel", value: null },
  ], query);
}

async function providerPicker() {
  const choices = await providerChoices();
  return await showMenu([...choices.map((row) => ({ label: row.label, value: row.value })), { label: "🔙 Back", value: null }]);
}

async function runTask(options: CLIOptions, trace?: (phase: string) => void) {
  setState(ui, "idle")
  clearGate(ui)
  // Check if Phi3 is available when using local
  if (options.local || options.provider === "phi3") {
    const isAvailable = await isLocalModelAvailable("phi3:mini-128k");
    if (!isAvailable) {
      console.error("❌ Phi3:mini-128k is not available locally.");
      console.error("Run: ollama pull phi3:mini-128k");
      process.exit(1);
    }
  }

  if (UI_DENSE) {
    console.log(`🧠 DAX Agent • mode:${options.mode} • dir:${options.workDir}`);
  } else {
    console.log(`🧠 DAX Agent
   Mode: ${options.mode}
   Directory: ${options.workDir}\n`);
  }
  trace?.("banner");

  let provider = await getProvider(options);
  trace?.("provider resolved");
  console.log(`Using provider: ${provider.name}${UI_DENSE ? "" : "\n"}`);

  // Use local-optimized registry for local models
  const useLocalTools = options.local || provider.name === "ollama";
  const tools = useLocalTools ? createLocalRegistry() : createToolRegistry();
  trace?.("tool registry ready");

  if (useLocalTools) {
    console.log(`⚡ Using local-optimized tool set${UI_DENSE ? "" : "\n"}`);
  }

  let agent = createAgent({
    name: "DAX",
    mode: options.mode,
    provider,
    tools,
    workDir: options.workDir,
    llmConfig: policyConfig(policy, options.model),
  });
  trace?.("agent initialized");

  if (options.task) {
    console.log(`📝 Task: ${options.task}${UI_DENSE ? "" : "\n"}`);
    await agent.startTask(options.task);

    // Show work notes
    const notes = agent.getWorkNotes();
    if (notes && SHOW_AUTO_NOTES) {
      console.log("📋 Work Notes Generated:\n");
      console.log(`Intent: ${notes.intent.what}`);
      console.log(`Why: ${notes.intent.why}\n`);
      console.log("Plan:");
      notes.plan.steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step}`);
      });
      console.log("");
    }

    // Execute in build mode
    if (options.mode === "build") {
      console.log(`🔧 Executing...${UI_DENSE ? "" : "\n"}`);

      let hasMore = true;
      let iteration = 0;
      const maxIterations = parseInt(
        env("DAX_MAX_ITERATIONS", "COGNITO_MAX_ITERATIONS", "20"),
        10,
      );

      while (hasMore && iteration < maxIterations) {
        iteration++;
        setState(ui, "running")
        hasMore = await agent.continue();
        const pending = agent.getPendingGate?.()
        if (pending) {
          setGate(ui, pending)
          setState(ui, "waiting_approval")
          const action = await promptGateResolution(pending)
          if (action.action === "approve_once") {
            await agent.approvePendingOnce?.()
            clearGate(ui)
            setState(ui, "running")
          } else if (action.action === "always_allow_tool") {
            await agent.alwaysAllowFromPending?.("tool")
            clearGate(ui)
            setState(ui, "running")
          } else if (action.action === "always_allow_path") {
            await agent.alwaysAllowFromPending?.("path", action.pattern)
            clearGate(ui)
            setState(ui, "running")
          } else {
            agent.rejectPendingGate?.()
            clearGate(ui)
            setState(ui, "done")
            console.log(warn("Execution cancelled by operator."))
            break
          }
        }

        // Show conversation
        const conversation = agent.getConversation();
        const lastMessage = conversation[conversation.length - 1];

        if (lastMessage.role === "assistant") {
          renderAssistant(lastMessage.content);
          renderToolResults(lastMessage.toolResults, lastMessage.toolCalls);
        }
      }

      setState(ui, "done")
      console.log(`${UI_DENSE ? "" : "\n"}✨ Task completed!`);
    }
  } else if (options.interactive) {
    console.log(
      `Interactive mode. Type your task or question (type 'exit' to quit):${UI_DENSE ? "" : "\n"}`,
    );
    console.log(`💡 Tip: Type '/' then a search term (palette), or '/help'.${UI_DENSE ? "" : "\n"}`);
    trace?.("interactive ready");

    let pendingInput: string | null = null;
    let statusDirty = true;
    const auth = await providerHealth(provider.name);
    if (/needed|missing|required|unable/i.test(auth)) {
      console.log(`${UI_DENSE ? "" : "\n"}Quick setup recommended: provider is not ready.`);
      const setup = await showMenu([
        { label: "🔌 Connect now", value: "/connect" },
        { label: "🧠 Pick provider", value: "PICK_PROVIDER" },
        { label: "⏭️ Continue anyway", value: null },
      ]);
      if (setup === "PICK_PROVIDER") {
        pendingInput = await providerPicker();
      } else if (setup) {
        pendingInput = setup;
      }
    }

    while (true) {
      if (statusDirty) {
        await printStatusLine(options, provider);
        statusDirty = false;
      }
      const inputStr = pendingInput ?? (await askQuestion("> "));
      pendingInput = null;

      let input = inputStr.trim();

      if (input === "\u001b") {
        continue;
      }

      if (input === "?" || input === "/") {
        const selection = await commandPalette();
        if (!selection) {
          continue;
        }
        input = selection;
        console.log(input);
      } else if (
        input.startsWith("/") &&
        !input.includes(" ") &&
        !["/exit", "/quit", "/clear", "/connect", "/help", "/status", "/doctor", "/policy", "/context", "/rao", "/pm", "/model", "/notes", "/mode", "/provider"].includes(input.toLowerCase())
      ) {
        const selection = await commandPalette(input.slice(1));
        if (!selection) {
          continue;
        }
        input = selection;
        console.log(input);
      }

      if (!input) continue;

      const routed = routeIntent(input);
      if (routed) {
        console.log(dim(`↪ ${routed}`));
        input = routed;
      }

      if (input.startsWith("/")) {
        const args = input.slice(1).split(/\s+/);
        const cmd = args[0].toLowerCase();
        const param = args[1];

        switch (cmd) {
          case "exit":
          case "quit":
            process.exit(0);
            break;

          case "clear":
            console.clear();
            statusDirty = true;
            continue;

          case "connect":
            try {
              const connectOptions = [
                { label: "🧩 ChatGPT via Codex CLI (Recommended)", value: "chatgpt-codex" },
                { label: "💎 ChatGPT Subscription (Device Flow)", value: "chatgpt" },
                { label: "🔑 ChatGPT API Key", value: "chatgpt-api" },
                { label: "🌟 Gemini CLI Login", value: "gemini-cli" },
                { label: "🌟 Gemini (Google Account)", value: "gemini" },
                { label: "🧠 Claude CLI Login", value: "claude-cli" },
                { label: "🔙 Back", value: null },
              ].filter((row) =>
                !ORCHESTRATOR_ONLY
                  ? true
                  : row.value === "chatgpt-codex" ||
                    row.value === "gemini-cli" ||
                    row.value === "claude-cli" ||
                    row.value === null,
              );

              const connectType = await showMenu(connectOptions);

              if (connectType === "chatgpt-codex") {
              console.log("\n🧩 Connect to ChatGPT Subscription via Codex CLI");
              console.log("Starting Codex device authentication...");
              await codexDeviceLogin();
              console.log("✅ Codex login completed.");
              setHealth("chatgpt-codex", "auth ok");
              options.local = false;
              options.provider = "chatgpt-codex";
              provider = await getProvider(options);
              {
                const history = agent.getConversation();
                const notes = agent.getWorkNotes();
                agent = createAgent({
                  name: "DAX",
                  mode: options.mode,
                  provider,
                  tools,
                  workDir: options.workDir,
                  llmConfig: policyConfig(policy, options.model),
                });
                // @ts-ignore
                if (history && agent.loadHistory) agent.loadHistory(history);
                // @ts-ignore
                if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
              }
              console.log("✅ Switched to chatgpt-codex");
              statusDirty = true;
              } else if (connectType === "gemini-cli") {
              console.log("\n🌟 Connect to Gemini via Gemini CLI");
              await geminiCliLogin();
              console.log("✅ Gemini CLI login completed.");
              setHealth("gemini-cli", "auth ok");
              options.local = false;
              options.provider = "gemini-cli";
              provider = await getProvider(options);
              {
                const history = agent.getConversation();
                const notes = agent.getWorkNotes();
                agent = createAgent({
                  name: "DAX",
                  mode: options.mode,
                  provider,
                  tools,
                  workDir: options.workDir,
                  llmConfig: policyConfig(policy, options.model),
                });
                // @ts-ignore
                if (history && agent.loadHistory) agent.loadHistory(history);
                // @ts-ignore
                if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
              }
              console.log("✅ Switched to gemini-cli");
              statusDirty = true;
              } else if (connectType === "claude-cli") {
              console.log("\n🧠 Connect to Claude via Claude CLI");
              await claudeCliLogin();
              console.log("✅ Claude CLI login completed.");
              setHealth("claude-cli", "auth ok");
              options.local = false;
              options.provider = "claude-cli";
              provider = await getProvider(options);
              {
                const history = agent.getConversation();
                const notes = agent.getWorkNotes();
                agent = createAgent({
                  name: "DAX",
                  mode: options.mode,
                  provider,
                  tools,
                  workDir: options.workDir,
                  llmConfig: policyConfig(policy, options.model),
                });
                // @ts-ignore
                if (history && agent.loadHistory) agent.loadHistory(history);
                // @ts-ignore
                if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
              }
              console.log("✅ Switched to claude-cli");
              statusDirty = true;
              } else if (connectType === "chatgpt") {
              console.log("\n🔗 Connect to ChatGPT Plus/Pro (Device Flow)");
              console.log("Starting device authorization...");
              const session = await startDeviceFlow("openai");
              console.log(`User Code: ${session.user_code}`);
              console.log(`Verify URL: ${session.verification_uri}`);
              console.log(`Quick Link: ${session.verification_uri_complete}`);
              const openCmd = Bun.which("open");
              const xdgOpenCmd = Bun.which("xdg-open");
              if (openCmd) {
                Bun.spawn([openCmd, session.verification_uri_complete], {
                  stderr: "ignore",
                  stdout: "ignore",
                });
              } else if (xdgOpenCmd) {
                Bun.spawn([xdgOpenCmd, session.verification_uri_complete], {
                  stderr: "ignore",
                  stdout: "ignore",
                });
              }
              console.log("Waiting for authorization...");
              const token = await waitForDeviceToken(
                "openai",
                session.device_code,
                session.interval,
                session.expires_in,
              );
              process.env.CHATGPT_SUBSCRIPTION_TOKEN = token.access_token;
              await saveEnv("CHATGPT_SUBSCRIPTION_TOKEN", token.access_token);
              if (token.refresh_token) {
                await saveEnv("CHATGPT_SUBSCRIPTION_REFRESH_TOKEN", token.refresh_token);
              }
              console.log("✅ ChatGPT subscription session connected.");
                setHealth("chatgpt-subscription", "token present");
                options.local = false;
                options.provider = "chatgpt-subscription";
                provider = await getProvider(options);
              {
                const history = agent.getConversation();
                const notes = agent.getWorkNotes();
                agent = createAgent({
                  name: "DAX",
                  mode: options.mode,
                  provider,
                  tools,
                  workDir: options.workDir,
                  llmConfig: policyConfig(policy, options.model),
                });
                // @ts-ignore
                if (history && agent.loadHistory) agent.loadHistory(history);
                // @ts-ignore
                if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
              }
              console.log("✅ Switched to chatgpt-subscription");
              statusDirty = true;
              } else if (connectType === "chatgpt-api") {
              console.log("\n🔑 Connect to ChatGPT with API Key");
              const key = await askQuestion("Enter OpenAI API Key: ");
              if (key.trim()) {
                process.env.OPENAI_API_KEY = key.trim();
                process.env.CHATGPT_PLUS_API_KEY = key.trim();
                await saveEnv("OPENAI_API_KEY", key.trim());
                await saveEnv("CHATGPT_PLUS_API_KEY", key.trim());
                console.log("✅ API key saved.");
                setHealth("chatgpt-api", "key present");
                options.local = false;
                options.provider = "chatgpt-api";
                provider = await getProvider(options);
                {
                  const history = agent.getConversation();
                  const notes = agent.getWorkNotes();
                  agent = createAgent({
                    name: "DAX",
                    mode: options.mode,
                    provider,
                    tools,
                    workDir: options.workDir,
                    llmConfig: policyConfig(policy, options.model),
                  });
                  // @ts-ignore
                  if (history && agent.loadHistory) agent.loadHistory(history);
                  // @ts-ignore
                  if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
                }
                console.log("✅ Switched to chatgpt-api");
                statusDirty = true;
              }
              } else if (connectType === "gemini") {
              console.log("\n🔗 Connect to Gemini (Google Account)");
              console.log(
                "1. Using saved OAuth credentials from .env.",
              );
              console.log(
                "2. Approve in browser using the verification link shown in terminal.",
              );

              syncGeminiEnv();
              const config = getGeminiOAuthConfig();
              const clientId = config.clientId;
              const clientSecret = config.clientSecret;
              const projectId = config.projectId;

              if (!clientId) {
                console.log("❌ Missing GOOGLE_CLIENT_ID (or GEMINI_OAUTH_CLIENT_ID) in .env.");
                console.log("Add them once, then run /connect again.");
                console.log("Optional: GOOGLE_CLIENT_SECRET, GOOGLE_PROJECT_ID");
                continue;
              }

              const tokens = await authenticateGemini(
                clientId,
                clientSecret,
                "shailesh.rawat1403@gmail.com",
              );
              if (tokens.access_token) {
                process.env.GOOGLE_ACCESS_TOKEN = tokens.access_token;
                await saveEnv("GOOGLE_ACCESS_TOKEN", tokens.access_token);
                await saveEnv("GEMINI_ACCESS_TOKEN", tokens.access_token);
                if (tokens.refresh_token)
                  await saveEnv("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
                if (tokens.refresh_token)
                  await saveEnv("GEMINI_REFRESH_TOKEN", tokens.refresh_token);
                console.log("✅ Authenticated with Google!");
                setHealth("gemini", "token/refresh present");
                options.local = false;
                options.provider = "gemini";
                provider = await getProvider(options);
                {
                  const history = agent.getConversation();
                  const notes = agent.getWorkNotes();
                  agent = createAgent({
                    name: "DAX",
                    mode: options.mode,
                    provider,
                    tools,
                    workDir: options.workDir,
                    llmConfig: policyConfig(policy, options.model),
                  });
                  // @ts-ignore
                  if (history && agent.loadHistory) agent.loadHistory(history);
                  // @ts-ignore
                  if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
                }
                console.log("✅ Switched to gemini");
                statusDirty = true;
              }
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.log(`Error: ${message}`);
              console.log("⚠️  Connect flow failed, but session is still active.");
            }
            continue;

          case "help":
            printCommandHelp();
            continue;

          case "status":
            clearHealth(provider.name);
            {
              const line = await statusLineText(options, provider, true);
              renderPinnedStatus(line);
              console.log(line);
              const raoCount = await agent.getRaoHistorySize?.() || 0
              console.log("rao_history: " + raoCount)
            }
            continue;

          case "doctor":
            {
              const codexReady = hasCodex() && (await codexLoginStatus());
              const geminiReady = (await geminiCliStatus()).ready;
              const claudeReady = (await claudeCliStatus()).ready;
              const openaiReady = Boolean(openaiKey());
              const subToken = Boolean((process.env.CHATGPT_SUBSCRIPTION_TOKEN || "").trim());
              const summary = [
                `${codexReady ? ok("✓") : warn("✗")} chatgpt-codex`,
                `${geminiReady ? ok("✓") : warn("✗")} gemini-cli`,
                `${claudeReady ? ok("✓") : warn("✗")} claude-cli`,
                `${openaiReady ? ok("✓") : warn("✗")} chatgpt-api`,
                `${subToken ? ok("✓") : warn("✗")} chatgpt-subscription token`,
              ];
              console.log(`\n${bold("Provider Doctor")}`);
              summary.forEach((line) => console.log(`  ${line}`));
              const recommended = codexReady
                ? "chatgpt-codex"
                : geminiReady
                  ? "gemini-cli"
                  : claudeReady
                    ? "claude-cli"
                    : openaiReady
                      ? "chatgpt-api"
                      : subToken
                        ? "chatgpt-subscription"
                        : "none";
              const stats = await loadScorecard();
              const top = Object.entries(stats)
                .sort((a, b) => (b[1].ok - b[1].err) - (a[1].ok - a[1].err))
                .slice(0, 5);
              if (top.length > 0) {
                console.log(`\n${bold("Scorecard")} ${dim("(top providers)")}`);
                top.forEach(([name, row]) => {
                  console.log(`  ${name}: ok=${row.ok} err=${row.err} fallback=${row.fallback}`);
                });
              }
              console.log(`\n${dim("Recommended default")}: ${kbd(recommended)}`);
              const auto = param === "--auto" || param === "auto";
              if (recommended !== "none" && auto) {
                pendingInput = `/provider ${recommended}`;
                continue;
              }
              if (recommended !== "none") {
                const answer = (await askQuestion(`Switch now to ${recommended}? [Y/n]: `)).trim().toLowerCase();
                if (!answer || answer === "y" || answer === "yes") {
                  pendingInput = `/provider ${recommended}`;
                }
              }
              console.log("");
            }
            continue;

          case "policy":
            {
              if (!param) {
                console.log(`Current policy: ${kbd(policy)}`);
                console.log("Usage: /policy <safe|balanced|aggressive>");
                continue;
              }
              if (!isPolicyName(param)) {
                console.log(`Unknown policy '${param}'. Use safe, balanced, or aggressive.`);
                continue;
              }
              policy = param;
              const history = agent.getConversation();
              const notes = agent.getWorkNotes();
              agent = createAgent({
                name: "DAX",
                mode: options.mode,
                provider,
                tools,
                workDir: options.workDir,
                llmConfig: policyConfig(policy, options.model),
              });
              if (history && agent.loadHistory) agent.loadHistory(history);
              if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
              console.log(`✅ Policy set to ${kbd(policy)}`);
              statusDirty = true;
            }
            continue;

          case "context":
            await printContext(agent, options, provider);
            continue;

          case "rao":
            if (param === "clear") {
              agent.clearRaoStatus?.()
              console.log("RAO status cleared.")
              continue
            }
            if (param === "purge") {
              const yes = args.includes("--yes")
              if (!yes) {
                const confirm = (await askQuestion("Type PURGE to confirm: ")).trim()
                if (confirm !== "PURGE") {
                  console.log("RAO purge cancelled.")
                  continue
                }
              }
              const done = await agent.purgeRaoHistory?.()
              console.log(done ? "RAO history purged." : "RAO purge failed.")
              continue
            }
            if (param === "--json") {
              printRaoStatus(agent, "json")
              continue
            }
            if (param === "replay") {
              const json = args.includes("--json")
              const raw = args.slice(2).find((row) => /^\d+$/.test(row)) || "10"
              const limit = Math.max(1, Math.min(50, parseInt(raw, 10) || 10))
              const rows = await agent.getRaoHistory?.(limit) || []
              if (json) {
                console.log(JSON.stringify(redacted(rows, "REDACTED"), null, 2))
                continue
              }
              printRaoReplay(rows)
              continue
            }
            printRaoStatus(agent, "text");
            continue;

          case "pm":
            if (param === "undo") {
              const reverted = await agent.undoPM?.()
              if (reverted) {
                console.log("✅ Reverted last PM change.")
              } else {
                console.log("No PM changes available to undo.")
              }
              continue
            }
            if (param === "history") {
              const n = Math.max(1, Math.min(50, parseInt(args[2] || "20", 10) || 20))
              const rows = await agent.listPMHistory?.(n) || []
              if (rows.length === 0) {
                console.log("No PM history events found.")
                continue
              }
              rows.forEach((row: { id: string; ts: string; command: string; changed_keys: string[] }) => {
                console.log(formatPMEventRow({
                  id: row.id,
                  ts: row.ts,
                  command: row.command,
                  changed_keys: row.changed_keys,
                }))
              })
              continue
            }
            if (param === "show") {
              const id = args[2]
              if (!id) {
                console.log("Usage: /pm show <event_id>")
                continue
              }
              const row = await agent.getPMHistoryEvent?.(id)
              if (!row) {
                console.log("PM event not found.")
                continue
              }
              const before = row.before_json as Record<string, unknown>
              const after = row.after_json as Record<string, unknown>
              console.log(`id: ${row.id}`)
              console.log(`ts: ${row.ts}`)
              console.log(`actor: ${row.actor || "user"}`)
              console.log(`command: ${row.command}`)
              console.log(`event_type: ${row.event_type}`)
              const keys = diffKeys(before, after)
              console.log(`changed_keys: ${keys.length > 0 ? keys.join(", ") : "none"}`)
              console.log("before:")
              console.log(safeJsonPreview(before, 1800))
              console.log("after:")
              console.log(safeJsonPreview(after, 1800))
              continue
            }
            console.log("Usage: /pm undo | /pm history [n] | /pm show <event_id>")
            continue

          case "model":
            if (!param) {
              const next = await askQuestion("Model ID: ");
              if (!next.trim()) {
                console.log("Usage: /model <id>");
                continue;
              }
              options.model = next.trim();
            } else {
              options.model = param.trim();
            }
            {
              const history = agent.getConversation();
              const notes = agent.getWorkNotes();
              clearHealth(provider.name);
              provider = await getProvider(options);
              agent = createAgent({
                name: "DAX",
                mode: options.mode,
                provider,
                tools,
                workDir: options.workDir,
                llmConfig: policyConfig(policy, options.model),
              });
              // @ts-ignore
              if (history && agent.loadHistory) agent.loadHistory(history);
              // @ts-ignore
              if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
            }
            console.log(`✅ Model set to ${options.model}`);
            statusDirty = true;
            continue;

          case "notes":
            const notes = agent.getWorkNotes();
            if (notes) {
              console.log("\n📋 Work Notes:");
              console.log(`Intent: ${notes.intent.what}`);
              console.log(`Plan: ${notes.plan.steps.join(" -> ")}\n`);
            } else {
              console.log("⚠️ No work notes generated yet.");
            }
            continue;

          case "mode":
            if (param === "build" || param === "plan") {
              options.mode = param;
              // Recreate agent to apply mode change while preserving state
              const history = agent.getConversation();
              const notes = agent.getWorkNotes();

              agent = createAgent({
                name: "DAX",
                mode: options.mode,
                provider,
                tools,
                workDir: options.workDir,
                llmConfig: policyConfig(policy, options.model),
              });

              // Restore state
              // @ts-ignore - methods exist on agent instance
              if (history && agent.loadHistory) agent.loadHistory(history);
              // @ts-ignore
              if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);

              console.log(`✅ Switched to ${param} mode`);
              console.log(
                dim(
                  param === "plan"
                    ? "Plan mode: analyze and propose before code changes."
                    : "Build mode: execute approved changes and tool actions.",
                ),
              );
              statusDirty = true;
            } else {
              console.log("Usage: /mode <build|plan>");
            }
            continue;

          case "provider":
            {
              const target = param || ((await providerPicker())?.split(" ")[1] || "");
              if (!target) {
                continue;
              }
              try {
                // Check for missing keys and prompt
                if (target === "openai" && !process.env.OPENAI_API_KEY) {
                  console.log("\n⚠️  OPENAI_API_KEY not found in environment.");
                  console.log(
                    "ℹ️  If you want to use your ChatGPT Plus subscription, use '/provider chatgpt-plus'.",
                  );

                  const key = await askQuestion(
                    "🔑 Enter your OpenAI API Key (from platform.openai.com): ",
                  );
                  if (key.trim()) {
                    process.env.OPENAI_API_KEY = key.trim();
                    await saveEnv("OPENAI_API_KEY", key.trim());
                  }
                }

                if (target === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
                  console.log(
                    "\n⚠️  ANTHROPIC_API_KEY not found in environment.",
                  );
                  const key = await askQuestion(
                    "🔑 Enter your Anthropic API Key: ",
                  );
                  if (key.trim()) {
                    process.env.ANTHROPIC_API_KEY = key.trim();
                    await saveEnv("ANTHROPIC_API_KEY", key.trim());
                  }
                }

                if (
                  target === "chatgpt-codex"
                ) {
                  if (!hasCodex()) {
                    console.log("\n⚠️  Codex CLI is not installed.");
                    console.log("Install Codex CLI and run '/connect'.");
                    continue;
                  }
                  const loggedIn = await codexLoginStatus();
                  if (!loggedIn) {
                    console.log("\n⚠️  Codex is not authenticated.");
                    console.log("Run '/connect' and choose ChatGPT via Codex CLI.");
                    continue;
                  }
                }

                if (target === "gemini-cli") {
                  const status = await geminiCliStatus();
                  if (!status.ready) {
                    console.log(`\n⚠️  ${status.reason}.`);
                    console.log("Run '/connect' and choose Gemini CLI Login.");
                    continue;
                  }
                }

                if (target === "claude-cli") {
                  const status = await claudeCliStatus();
                  if (!status.ready) {
                    console.log(`\n⚠️  ${status.reason}.`);
                    console.log("Run '/connect' and choose Claude CLI Login.");
                    continue;
                  }
                }

                if (
                  (target === "chatgpt-plus" || target === "chatgpt-subscription") &&
                  !(process.env.CHATGPT_SUBSCRIPTION_TOKEN || "").trim()
                ) {
                  console.log("\n⚠️  ChatGPT subscription token not found.");
                  console.log("Run '/connect' and choose ChatGPT Subscription (Device Flow).");
                  continue;
                }

                if (target === "chatgpt-api" && !openaiKey()) {
                  console.log("\n⚠️  ChatGPT API key not found.");
                  const key = await askQuestion("Enter OpenAI API Key: ");
                  if (key.trim()) {
                    process.env.OPENAI_API_KEY = key.trim();
                    process.env.CHATGPT_PLUS_API_KEY = key.trim();
                    await saveEnv("OPENAI_API_KEY", key.trim());
                    await saveEnv("CHATGPT_PLUS_API_KEY", key.trim());
                  } else {
                    continue;
                  }
                }

                if (
                  target === "gemini" &&
                  !process.env.GOOGLE_ACCESS_TOKEN &&
                  (!process.env.GOOGLE_CLIENT_ID ||
                    !process.env.GOOGLE_REFRESH_TOKEN)
                ) {
                  syncGeminiEnv();
                  const config = getGeminiOAuthConfig();
                  console.log("\n⚠️  Gemini auth credentials not found.");
                  console.log("Please run '/connect'.");

                  // Check for Client ID/Secret
                  if (
                    !config.clientId
                  ) {
                    console.log(
                      "Set GOOGLE_CLIENT_ID (or GEMINI_OAUTH_CLIENT_ID) in .env, then run '/connect' again.",
                    );
                    continue;
                  }

                  if (config.clientId) {
                    // Trigger Auth Flow
                    console.log("Launching browser for authentication...");
                    const tokens = await authenticateGemini(
                      config.clientId,
                      config.clientSecret,
                      "shailesh.rawat1403@gmail.com",
                    );
                    if (tokens.access_token) {
                      process.env.GOOGLE_ACCESS_TOKEN = tokens.access_token;
                      await saveEnv("GOOGLE_ACCESS_TOKEN", tokens.access_token);
                      await saveEnv("GEMINI_ACCESS_TOKEN", tokens.access_token);
                      if (tokens.refresh_token)
                        await saveEnv(
                          "GOOGLE_REFRESH_TOKEN",
                          tokens.refresh_token,
                        );
                      if (tokens.refresh_token)
                        await saveEnv("GEMINI_REFRESH_TOKEN", tokens.refresh_token);
                      console.log("✅ Authenticated with Google!");
                    }
                  }
                }

                options.local = false; // Disable local override if manually switching
                options.provider = target;
                clearHealth(target);
                provider = await getProvider(options);

                const history = agent.getConversation();
                const notes = agent.getWorkNotes();

	                agent = createAgent({
	                  name: "DAX",
	                  mode: options.mode,
	                  provider,
	                  tools,
	                  workDir: options.workDir,
	                  llmConfig: policyConfig(policy, options.model),
	                });

                // @ts-ignore
                if (history && agent.loadHistory) agent.loadHistory(history);
                // @ts-ignore
                if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);

                console.log(`✅ Switched to ${provider.name}`);
                statusDirty = true;
              } catch (e) {
                console.log(`❌ Failed to switch provider: ${e}`);
              }
            }
            continue;

          default:
            {
              const nearest = nearestCommand(`/${cmd}`);
              if (!nearest) {
                console.log(`Unknown command: ${cmd}`);
                continue;
              }
              const rest = args.slice(1).join(" ");
              const next = `${nearest}${rest ? ` ${rest}` : ""}`;
              const choice = (await askQuestion(`Unknown '/${cmd}'. Run '${next}'? [Y/n]: `)).trim().toLowerCase();
              if (!choice || choice === "y" || choice === "yes") {
                pendingInput = next;
              }
            }
            continue;
        }
      }

      if (input.toLowerCase() === "exit") break;

      try {
        if (!agent.getWorkNotes()) {
          if (isGreeting(input)) {
            renderAssistant("Hi. Ready when you are. Tell me what you want to build, fix, or review.");
            continue;
          }

          if (!looksTaskLike(input)) {
            // Keep early interaction conversational; don't force planning artifacts.
            // Stream when provider supports it for lower perceived latency.
            setState(ui, "running")
            if (agent.canStream()) {
              if (UI_DENSE) {
                console.log(`\n${accent(bold(ASSISTANT_NAME))}`);
              } else {
                console.log(`\n${dim("┌")} ${accent(bold(ASSISTANT_NAME))}`);
              }
              let sawChunk = false;
              const stopThinking = startDaxSpinner("orchestrating response...");
              await agent.chatStream(input, (chunk) => {
                if (!sawChunk) {
                  stopThinking();
                  sawChunk = true;
                }
                process.stdout.write(chunk);
              });
              if (!sawChunk) {
                stopThinking();
              }
              process.stdout.write(UI_DENSE ? "\n\n" : `\n${dim("└")}\n\n`);
            } else {
              await withSpinner("Thinking...", async () => {
                await agent.chat(input);
              });
            }
          } else {
            setState(ui, "planning")
            await withSpinner("Planning...", async () => {
              await agent.startTask(input);
            });
          }

          const notes = agent.getWorkNotes();
          if (notes && SHOW_AUTO_NOTES) {
            console.log(`\n📋 Work Notes:`);
            console.log(`Intent: ${notes.intent.what}`);
            console.log(`Plan: ${notes.plan.steps.join(" -> ")}\n`);
          }
        } else {
          setState(ui, "running")
          await withSpinner("Running...", async () => {
            await agent.sendMessage(input);
          });
        }

        const pending = agent.getPendingGate?.()
        if (pending) {
          setGate(ui, pending)
          setState(ui, "waiting_approval")
          statusDirty = true
          const action = await promptGateResolution(pending)
          if (action.action === "approve_once") {
            await agent.approvePendingOnce?.()
            clearGate(ui)
            setState(ui, "running")
          } else if (action.action === "always_allow_tool") {
            await agent.alwaysAllowFromPending?.("tool")
            clearGate(ui)
            setState(ui, "running")
          } else if (action.action === "always_allow_path") {
            await agent.alwaysAllowFromPending?.("path", action.pattern)
            clearGate(ui)
            setState(ui, "running")
          } else {
            agent.rejectPendingGate?.()
            clearGate(ui)
            setState(ui, "idle")
            console.log(warn("Pending operation rejected."))
          }
        }

        const conversation = agent.getConversation();
        const lastMessage = conversation[conversation.length - 1];
        const streamed = !looksTaskLike(input) && agent.canStream();
        if (lastMessage.role === "assistant" && !streamed) {
          renderAssistant(lastMessage.content);
          renderToolResults(lastMessage.toolResults, lastMessage.toolCalls);
        }
        setState(ui, "idle")
        await recordProvider(provider.name, "ok");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState(ui, "error")
        await recordProvider(provider.name, "err");
        {
          const fallback = resolveFallbackProvider(
            provider.name,
            message,
            {
              codex: hasCodex() && (await codexLoginStatus()),
              gemini_cli: (await geminiCliStatus()).ready,
              claude_cli: (await claudeCliStatus()).ready,
            },
          );
          if (fallback) {
            const failedProvider = provider.name;
            const history = agent.getConversation();
            const notes = agent.getWorkNotes();
            options.local = false;
            options.provider = fallback;
            provider = await getProvider(options);
            agent = createAgent({
              name: "DAX",
              mode: options.mode,
              provider,
              tools,
              workDir: options.workDir,
              llmConfig: policyConfig(policy, options.model),
            });
            if (history && agent.loadHistory) agent.loadHistory(history);
            if (notes && agent.setWorkNotes) agent.setWorkNotes(notes);
            console.log(
              `${warn("⚠")} Provider error detected. Auto-switched to ${kbd(fallback)} and retrying.`,
            );
            await recordProvider(failedProvider, "fallback");
            setState(ui, "idle")
            statusDirty = true;
            pendingInput = input;
            continue;
          }
        }
        renderError(message);
      }
    }
  } else {
    console.log("No task provided. Use -h for help.");
  }
}

function printRaoStatus(agent: {
  getRaoStatus?: () => {
    run: { tool: string; targets: string[]; result: "ok" | "failed"; ts: string } | null
    audit: { gate: "clean" | "warn" | "blocked"; warnings: { code: string }[] }
    override: { id: string; changed_keys: string[] } | null
  }
}, mode: "text" | "json" = "text") {
  const status = agent.getRaoStatus?.()
  if (!status) {
    console.log("RAO status unavailable.")
    return
  }
  if (mode === "json") {
    console.log(JSON.stringify(redacted(status, "REDACTED"), null, 2))
    return
  }
  const run = status.run
    ? "tool=" + status.run.tool + " targets=" + (status.run.targets.join(",") || "none") + " result=" + status.run.result + " ts=" + status.run.ts
    : "none"
  const top = status.audit.warnings.slice(0, 2).map((row) => row.code).join(", ") || "none"
  const audit = "gate=" + status.audit.gate + " warnings=" + status.audit.warnings.length + " (top: " + top + ")"
  const keys = status.override?.changed_keys || []
  const head = keys.slice(0, 6).join(", ") || "none"
  const extra = keys.length > 6 ? ",+" + (keys.length - 6) + " more" : ""
  const over = status.override
    ? "last_pm_event=" + status.override.id + " keys=" + head + extra
    : "none"
  console.log("RAO")
  console.log("run      : " + run)
  console.log("audit    : " + audit)
  console.log("override : " + over)
}

function printRaoReplay(rows: {
  ts: string
  kind: string
  run?: { tool: string; targets: string[]; ok: boolean }
  audit?: { blocked: boolean; warnings: { code: string }[] }
  override?: { event_id: string; changed_keys: string[] }
}[]) {
  if (rows.length === 0) {
    console.log("No RAO history found.")
    return
  }
  rows.forEach((row) => {
    const ts = row.ts.split("T")[1]?.slice(0, 8) || row.ts
    if (row.kind === "run" && row.run) {
      const targets = row.run.targets.join(",") || "none"
      console.log(ts + " • run • tool=" + row.run.tool + " ok=" + (row.run.ok ? "1" : "0") + " targets=" + targets)
      return
    }
    if (row.kind === "audit" && row.audit) {
      const top = row.audit.warnings.slice(0, 2).map((warning) => warning.code).join(",") || "none"
      console.log(ts + " • audit • blocked=" + (row.audit.blocked ? "1" : "0") + " warnings=" + top)
      return
    }
    if (row.kind === "override" && row.override) {
      const keys = row.override.changed_keys.slice(0, 3).join(",") || "none"
      const extra = row.override.changed_keys.length > 3 ? ",+" + (row.override.changed_keys.length - 3) : ""
      console.log(ts + " • override • event=" + row.override.event_id + " keys=" + keys + extra)
      return
    }
    console.log(ts + " • " + row.kind)
  })
}

async function main() {
  try {
    const trace = startupTrace();
    syncGeminiEnv();
    trace("env synced");
    const options = parseCliArgs();
    trace("args parsed");
    initDb();
    if (await warnLegacyEnvOnce(options.workDir)) {
      console.log(warn("Using legacy COGNITO_* env vars. Prefer DAX_* (see MIGRATION.md)."))
    }

    if (options.listModels) {
      await listLocalModels();
      trace("list models done");
      return;
    }

    await runTask(options, trace);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

main();
