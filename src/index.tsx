import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { serveStatic } from "hono/bun";
import {
  createWorkNote,
  createWorkNoteSchema,
  createDecision,
  createDecisionSchema,
  createExperiment,
  createExperimentSchema,
  deleteWorkNote,
  deleteDecision,
  deleteExperiment,
  getContracts,
  getDecisions,
  getExperiments,
  getWorkNoteById,
  getDecisionById,
  getExperimentById,
  getWorkNotes,
  updateWorkNote,
  updateWorkNoteSchema,
  updateDecision,
  updateDecisionSchema,
  updateExperiment,
  updateExperimentSchema,
} from "./data";
import { agentManager } from "./agent/manager.js";
import {
  wsManager,
  broadcastAgentStarted,
  broadcastAgentMessage,
  broadcastAgentCompleted,
} from "./websocket/manager.js";
import type { ServerWebSocket } from "bun";
import { authMiddleware, optionalAuthMiddleware, requireRole } from "./auth.js";
import { globalRateLimit, ipRateLimit } from "./rate-limit.js";
import {
  exchangeDeviceCode,
  issueDeviceCode,
  validateSubscriptionToken,
  verifyDevicePage,
} from "./oauth/device.js";

const app = new Hono();
let bridgeProcess: Bun.Subprocess | null = null;

async function ensureLocalSubscriptionBridge(externalBridge: string) {
  let url: URL;
  try {
    url = new URL(externalBridge);
  } catch {
    return;
  }
  if (!["http:", "https:"].includes(url.protocol)) return;
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return;
  const healthUrl = `${url.origin}/health`;
  try {
    const response = await fetch(healthUrl);
    if (response.ok) return;
  } catch {}

  if (!bridgeProcess) {
    const bunBin = process.execPath || Bun.which("bun") || "bun";
    bridgeProcess = Bun.spawn([bunBin, "bridges/subscription-bridge/server.ts"], {
      cwd: process.cwd(),
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        BRIDGE_PORT: url.port || "8788",
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
}

// Security headers middleware
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  await next();
});

// CORS configuration
const CORS_ORIGIN =
  process.env.DAX_CORS_ORIGIN || process.env.COGNITO_CORS_ORIGIN ||
  (process.env.NODE_ENV === "production" ? "" : "*");
app.use(
  "/api/*",
  cors({
    origin: CORS_ORIGIN || "*",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

// Rate limiting
app.use("/api/*", ipRateLimit);
app.use("/api/*", globalRateLimit);

// ─── API Routes ───
const workNotesApi = new Hono()
  .get("/", async (c) => {
    const data = await getWorkNotes();
    return c.json(data);
  })
  .post("/", zValidator("json", createWorkNoteSchema), async (c) => {
    const body = c.req.valid("json");
    const newNote = await createWorkNote(body);
    return c.json(newNote, 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const note = await getWorkNoteById(id);
    if (!note) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(note);
  })
  .put("/:id", zValidator("json", updateWorkNoteSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const updatedNote = await updateWorkNote(id, body);
    if (!updatedNote) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(updatedNote);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deletedNote = await deleteWorkNote(id);
    if (!deletedNote) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(deletedNote);
  });

const decisionsApi = new Hono()
  .get("/", async (c) => {
    const data = await getDecisions();
    return c.json(data);
  })
  .post("/", zValidator("json", createDecisionSchema), async (c) => {
    const body = c.req.valid("json");
    const newDecision = await createDecision(body);
    return c.json(newDecision, 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const decision = await getDecisionById(id);
    if (!decision) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(decision);
  })
  .put("/:id", zValidator("json", updateDecisionSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const updatedDecision = await updateDecision(id, body);
    if (!updatedDecision) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(updatedDecision);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deletedDecision = await deleteDecision(id);
    if (!deletedDecision) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(deletedDecision);
  });

const experimentsApi = new Hono()
  .get("/", async (c) => {
    const data = await getExperiments();
    return c.json(data);
  })
  .post("/", zValidator("json", createExperimentSchema), async (c) => {
    const body = c.req.valid("json");
    const newExperiment = await createExperiment(body);
    return c.json(newExperiment, 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const experiment = await getExperimentById(id);
    if (!experiment) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(experiment);
  })
  .put("/:id", zValidator("json", updateExperimentSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const updatedExperiment = await updateExperiment(id, body);
    if (!updatedExperiment) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(updatedExperiment);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deletedExperiment = await deleteExperiment(id);
    if (!deletedExperiment) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(deletedExperiment);
  });

const startTaskSchema = z.object({
  task: z.string(),
  mode: z.enum(["build", "plan"]).default("build"),
  provider: z
    .enum([
      "openai",
      "anthropic",
      "ollama",
      "chatgpt-codex",
      "chatgpt-plus",
      "chatgpt-subscription",
      "chatgpt-api",
      "gemini",
      "gemini-cli",
      "claude-cli",
    ])
    .optional(),
  require_approval: z.boolean().default(true),
});

const sendMessageSchema = z.object({
  message: z.string(),
});

const deviceCodeSchema = z.object({
  provider: z.enum(["openai", "google", "gemini", "chatgpt-plus"]).default("openai"),
  client_id: z.string().optional(),
  scope: z.string().optional(),
});

const tokenSchema = z.object({
  grant_type: z.string(),
  device_code: z.string().optional(),
  client_id: z.string().optional(),
  refresh_token: z.string().optional(),
});

const agentApi = new Hono()
  // Apply authentication middleware to all agent routes
  .use("/*", authMiddleware)
  .get("/", async (c) => {
    const includeArchived = c.req.query("archived") === "true";
    const agents = await agentManager.listAgents(includeArchived);
    return c.json(agents);
  })
  .post("/start", zValidator("json", startTaskSchema), async (c) => {
    const body = c.req.valid("json");
    const user = (c as any).get("user") as { id: string };

    try {
      const { agentId, agent } = await agentManager.createAgent(user.id, body);

      // Broadcast agent started
      broadcastAgentStarted(agentId, body.task);

      return c.json(
        {
          agentId,
          message: "Agent started",
          workNotes: agent.getWorkNotes(),
        },
        201,
      );
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  })
  .post("/:id/continue", async (c) => {
    const agentId = c.req.param("id");
    const session = await agentManager.getAgent(agentId);

    if (!session) {
      return c.json({ error: "Agent not found" }, 404);
    }

    if (session.status === "paused") {
      return c.json({ error: "Agent is paused. Resume it first." }, 400);
    }

    const { agent } = session;

    try {
      const hasMore = await agent.continue();
      agentManager.updateAgent(agentId, agent);

      return c.json({
        agentId,
        hasMore,
        conversation: agent.getConversation(),
        workNotes: agent.getWorkNotes(),
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  })
  .post("/:id/message", zValidator("json", sendMessageSchema), async (c) => {
    const agentId = c.req.param("id");
    const session = await agentManager.getAgent(agentId);

    if (!session) {
      return c.json({ error: "Agent not found" }, 404);
    }
    const { agent } = session;

    try {
      const body = c.req.valid("json");
      await agent.sendMessage(body.message);
      agentManager.updateAgent(agentId, agent);

      return c.json({
        agentId,
        conversation: agent.getConversation(),
        workNotes: agent.getWorkNotes(),
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  })
  .post("/:id/pause", async (c) => {
    const agentId = c.req.param("id");
    const session = await agentManager.getAgent(agentId);

    if (!session) {
      return c.json({ error: "Agent not found" }, 404);
    }

    await agentManager.pauseAgent(agentId);
    return c.json({ message: "Agent paused", agentId, status: "paused" });
  })
  .post("/:id/resume", async (c) => {
    const agentId = c.req.param("id");
    const session = await agentManager.getAgent(agentId);

    if (!session) {
      return c.json({ error: "Agent not found" }, 404);
    }

    await agentManager.resumeAgent(agentId);
    return c.json({ message: "Agent resumed", agentId, status: "running" });
  })
  .get("/:id", async (c) => {
    const agentId = c.req.param("id");
    const session = await agentManager.getAgent(agentId);

    if (!session) {
      return c.json({ error: "Agent not found" }, 404);
    }
    const { agent } = session;

    return c.json({
      agentId,
      conversation: agent.getConversation(),
      workNotes: agent.getWorkNotes(),
      mode: agent.getMode(),
      status: session.status,
    });
  })
  .delete("/:id", async (c) => {
    const agentId = c.req.param("id");
    agentManager.deleteAgent(agentId);
    return c.json({ message: "Agent deleted" });
  });

// WebSocket endpoint
const wsApi = new Hono().get("/stats", (c) => {
  return c.json({
    clients: wsManager.getClientCount(),
    channels: wsManager.getChannelCount(),
  });
});

const oauthApi = new Hono()
  .post("/device/code", zValidator("json", deviceCodeSchema), (c) => {
    const body = c.req.valid("json");
    const host = c.req.header("host") || "localhost:4096";
    const proto = c.req.header("x-forwarded-proto") || "http";
    const base = `${proto}://${host}/api`;
    const data = issueDeviceCode({
      provider: body.provider,
      client_id: body.client_id,
      scope: body.scope,
      base_url: base,
    });
    return c.json(data, 201);
  })
  .post("/token", zValidator("json", tokenSchema), (c) => {
    const body = c.req.valid("json");
    const out = exchangeDeviceCode(body);
    return c.json(out.body, out.status as 200 | 400);
  })
  .get("/device/verify", (c) => {
    const user_code = c.req.query("user_code") || "";
    const approve = c.req.query("approve") === "1";
    const out = verifyDevicePage(user_code, approve);
    c.header("Content-Type", "text/html; charset=utf-8");
    return c.body(out.html, out.status as 200 | 404 | 410);
  });

const bridgeRequestSchema = z.object({
  model: z.string().default("gpt-4o"),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.string(),
    }),
  ),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  stream: z.boolean().optional(),
}).passthrough();

const subscriptionApi = new Hono().post(
  "/chat/completions",
  zValidator("json", bridgeRequestSchema),
  async (c) => {
    const auth = c.req.header("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) {
      return c.json({ error: { message: "Missing bearer token", code: "UNAUTHORIZED" } }, 401);
    }

    const session = validateSubscriptionToken(token);
    if (!session) {
      return c.json({ error: { message: "Invalid subscription token", code: "UNAUTHORIZED" } }, 401);
    }

    const externalBridge = (process.env.SUBSCRIPTION_UPSTREAM_CHAT_COMPLETIONS_URL || "").trim();
    const externalToken = (process.env.SUBSCRIPTION_UPSTREAM_BEARER_TOKEN || "").trim();

    if (!externalBridge) {
      return c.json(
        {
          error: {
            message:
              "Subscription bridge is not configured. Set SUBSCRIPTION_UPSTREAM_CHAT_COMPLETIONS_URL to your provider-managed bridge endpoint.",
            code: "SUBSCRIPTION_BRIDGE_NOT_CONFIGURED",
          },
        },
        500,
      );
    }

    const body = c.req.valid("json");
    let response: Response;
    try {
      await ensureLocalSubscriptionBridge(externalBridge);
      response = await fetch(externalBridge, {
        method: "POST",
        headers: {
          Authorization: externalToken ? `Bearer ${externalToken}` : `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Subscription-Plan": session.plan,
          "X-Subscription-Provider": session.provider,
          "X-Subscription-Token": token,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return c.json(
        {
          error: {
            message: `Unable to connect to subscription upstream bridge at ${externalBridge}. Start the bridge or update SUBSCRIPTION_UPSTREAM_CHAT_COMPLETIONS_URL.`,
            code: "SUBSCRIPTION_UPSTREAM_UNREACHABLE",
            details: error instanceof Error ? error.message : String(error),
          },
        },
        502,
      );
    }

    if (response.status === 401 || response.status === 403) {
      return c.json(
        {
          error: {
            message:
              "Subscription token is valid locally, but upstream provider auth failed. Ensure your bridge accepts X-Subscription-Token pass-through or valid bridge bearer credentials.",
            code: "SUBSCRIPTION_UPSTREAM_AUTH_FAILED",
          },
        },
        502,
      );
    }

    const contentType = response.headers.get("content-type") || "application/json";
    c.header("Content-Type", contentType);
    if (contentType.includes("text/event-stream")) {
      const body = response.body;
      if (!body) {
        return c.json(
          { error: { message: "Upstream stream has no body", code: "SUBSCRIPTION_UPSTREAM_EMPTY_STREAM" } },
          502,
        );
      }
      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": response.headers.get("cache-control") || "no-cache",
          Connection: response.headers.get("connection") || "keep-alive",
        },
      });
    }
    const text = await response.text();
    return c.body(text, response.status as 200 | 400 | 401 | 429 | 500);
  },
);

const api = new Hono()
  .route("/work-notes", workNotesApi)
  .route("/decisions", decisionsApi)
  .route("/experiments", experimentsApi)
  .route("/agent", agentApi)
  .route("/ws", wsApi)
  .route("/oauth", oauthApi)
  .route("/subscription", subscriptionApi)
  .get("/contracts", async (c) => {
    const data = await getContracts();
    return c.json(data);
  })
  .get("/health", (c) => {
    return c.json({
      status: "ok",
      agent: "dax",
      version: "1.0.0",
      features: [
        "work-notes",
        "decisions",
        "experiments",
        "agent",
        "websocket",
        "oauth-device-flow",
        "subscription-bridge",
      ],
      websocket: {
        clients: wsManager.getClientCount(),
        channels: wsManager.getChannelCount(),
      },
    });
  });

app.route("/api", api);

// Serve static files from the built frontend app
app.use("/*", serveStatic({ root: "./packages/app/dist" }));
// For SPA, serve index.html for any route that is not an asset
app.get("*", serveStatic({ path: "./packages/app/dist/index.html" }));

// WebSocket handler
const wsHandler = {
  message(ws: ServerWebSocket<unknown>, message: string | Buffer) {
    try {
      const data = JSON.parse(message.toString());
      const clientId = (ws as unknown as { clientId?: string }).clientId;

      if (data.type === "subscribe" && data.channel) {
        wsManager.subscribe(clientId!, data.channel);
        ws.send(
          JSON.stringify({
            type: "subscribed",
            channel: data.channel,
            timestamp: new Date().toISOString(),
          }),
        );
      } else if (data.type === "unsubscribe" && data.channel) {
        wsManager.unsubscribe(clientId!, data.channel);
        ws.send(
          JSON.stringify({
            type: "unsubscribed",
            channel: data.channel,
            timestamp: new Date().toISOString(),
          }),
        );
      } else if (data.type === "ping") {
        ws.send(
          JSON.stringify({
            type: "pong",
            timestamp: new Date().toISOString(),
          }),
        );
      }
    } catch {
      // Invalid message, ignore
    }
  },
  open(ws: ServerWebSocket<unknown>) {
    const clientId = wsManager.addClient(ws);
    (ws as unknown as { clientId: string }).clientId = clientId;

    ws.send(
      JSON.stringify({
        type: "connected",
        clientId,
        timestamp: new Date().toISOString(),
      }),
    );

    console.log(`WebSocket client connected: ${clientId}`);
  },
  close(ws: ServerWebSocket<unknown>) {
    const clientId = (ws as unknown as { clientId?: string }).clientId;
    if (clientId) {
      wsManager.removeClient(clientId);
      console.log(`WebSocket client disconnected: ${clientId}`);
    }
  },
};

// Log startup info
console.log("🧠 DAX Agent Server");
console.log("📡 API: http://localhost:4096/api");
console.log("🔌 WebSocket: ws://localhost:4096/ws");
console.log("🏥 Health: http://localhost:4096/api/health");
console.log("\nTo start the web UI:");
console.log("  npm run dev:web");
console.log("\nTo use CLI:");
console.log("  bun src/cli/main.ts --help");

export default app;
export { wsHandler };
