import { Hono } from "hono";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function error(message: string, code: string) {
  return { error: { message, code } };
}

const port = Number.parseInt(env("BRIDGE_PORT") || "8788", 10);
const clientToken = env("BRIDGE_CLIENT_TOKEN");
const upstreamUrl = env("UPSTREAM_CHAT_COMPLETIONS_URL");
const upstreamHeaderName = env("UPSTREAM_AUTH_HEADER_NAME") || "Authorization";
const upstreamHeaderValue =
  env("UPSTREAM_AUTH_HEADER_VALUE") ||
  (env("UPSTREAM_AUTH_BEARER") ? `Bearer ${env("UPSTREAM_AUTH_BEARER")}` : "");
const forwardSubscriptionToken =
  (env("UPSTREAM_FORWARD_SUBSCRIPTION_TOKEN") || "true").toLowerCase() !== "false";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    bridge: "subscription-bridge",
    config: {
      has_client_token: Boolean(clientToken),
      has_upstream_url: Boolean(upstreamUrl),
      has_upstream_auth: Boolean(upstreamHeaderValue),
      upstream_header_name: upstreamHeaderName,
      forward_subscription_token: forwardSubscriptionToken,
    },
  });
});

app.post("/chat/completions", async (c) => {
  const auth = c.req.header("authorization") || "";
  if (!clientToken) {
    return c.json(
      error(
        "Bridge is missing BRIDGE_CLIENT_TOKEN.",
        "BRIDGE_NOT_CONFIGURED",
      ),
      500,
    );
  }
  if (auth !== `Bearer ${clientToken}`) {
    return c.json(error("Unauthorized bridge caller.", "UNAUTHORIZED"), 401);
  }
  if (!upstreamUrl) {
    return c.json(
      error(
        "Bridge is missing UPSTREAM_CHAT_COMPLETIONS_URL.",
        "UPSTREAM_NOT_CONFIGURED",
      ),
      500,
    );
  }

  const body = await c.req.text();
  const headers = new Headers({ "Content-Type": "application/json" });

  const subscriptionToken = c.req.header("x-subscription-token") || "";

  if (forwardSubscriptionToken && subscriptionToken) {
    headers.set(upstreamHeaderName, `Bearer ${subscriptionToken}`);
  } else if (upstreamHeaderValue) {
    headers.set(upstreamHeaderName, upstreamHeaderValue);
  } else if (forwardSubscriptionToken) {
    return c.json(
      error(
        "Bridge expected X-Subscription-Token but none was provided.",
        "MISSING_SUBSCRIPTION_TOKEN",
      ),
      401,
    );
  }

  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    body,
  });

  const text = await response.text();
  c.header("Content-Type", response.headers.get("content-type") || "application/json");
  return c.body(text, response.status as 200 | 400 | 401 | 403 | 404 | 429 | 500);
});

console.log(`🔐 Subscription bridge listening on http://localhost:${port}`);
console.log(`📨 POST http://localhost:${port}/chat/completions`);
console.log(`🏥 GET  http://localhost:${port}/health`);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

process.on("SIGINT", () => {
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
