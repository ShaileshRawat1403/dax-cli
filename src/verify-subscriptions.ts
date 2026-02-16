import { ChatGPTProvider } from "./agent/chatgpt.js";
import { GeminiProvider } from "./agent/gemini.js";
import {
  getGeminiOAuthConfig,
  refreshGeminiAccessToken,
  syncGeminiEnv,
} from "./auth/gemini.js";

function value(name: string) {
  const raw = process.env[name]?.trim() || "";
  if (raw === "/") return "";
  return raw;
}

function openaiKey() {
  return value("OPENAI_API_KEY") || value("CHATGPT_PLUS_API_KEY");
}

function chatgptSubscriptionToken() {
  return value("CHATGPT_SUBSCRIPTION_TOKEN");
}

function subscriptionBridgeUrl() {
  return value("CHATGPT_SUBSCRIPTION_BRIDGE_URL") || "http://localhost:4096/api/subscription/chat/completions";
}

function mask(token: string) {
  if (!token) return "missing";
  if (token.length <= 10) return "***";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

async function testGeminiAuth(verbose: boolean) {
  console.log("🔐 Gemini Auth Method Test (OAuth 2.0)");

  const config = getGeminiOAuthConfig();
  const access = config.accessToken;
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  const refresh = config.refreshToken;
  const projectId = config.projectId;

  if (verbose) {
    console.log(`  GOOGLE_ACCESS_TOKEN: ${mask(access)}`);
    console.log(`  GOOGLE_CLIENT_ID: ${clientId ? "set" : "missing"}`);
    console.log(
      `  GOOGLE_CLIENT_SECRET: ${clientSecret ? "set (optional)" : "missing (optional)"}`,
    );
    console.log(`  GOOGLE_REFRESH_TOKEN: ${mask(refresh)}`);
    console.log(`  GOOGLE_PROJECT_ID: ${projectId || "missing"}`);
  }

  let token = access;
  if (!token && clientId && refresh) {
    try {
      const refreshed = await refreshGeminiAccessToken(
        clientId,
        clientSecret,
        refresh,
      );
      token = refreshed.access_token || "";
      if (token) {
        process.env.GOOGLE_ACCESS_TOKEN = token;
        console.log("  ✅ Obtained access token from refresh token");
      }
      if (verbose) {
        console.log(`  refreshed expires_in: ${refreshed.expires_in || "unknown"}s`);
      }
    } catch (e) {
      console.log("  ❌ Refresh token flow failed");
      if (verbose) {
        console.log(`  ↳ ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
  }

  if (!token) {
    console.log("  ❌ Missing GOOGLE_ACCESS_TOKEN");
    console.log(
      "  ℹ️  Set GOOGLE_ACCESS_TOKEN or provide GOOGLE_CLIENT_ID + GOOGLE_REFRESH_TOKEN",
    );
    return;
  }

  let info: Response;
  try {
    info = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    );
  } catch (e) {
    console.log("  ❌ Could not reach Google tokeninfo endpoint");
    if (verbose) {
      console.log(`  ↳ ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }
  if (!info.ok) {
    console.log(`  ❌ Access token validation failed (${info.status})`);
    if (verbose) {
      console.log(`  ↳ ${await info.text()}`);
    }
    return;
  }

  const data = await info.json();
  const scope = typeof data.scope === "string" ? data.scope : "";
  console.log("  ✅ Access token is valid");
  if (verbose) {
    console.log(`  token audience: ${data.aud || "unknown"}`);
    console.log(`  expires_in: ${data.expires_in || "unknown"}s`);
    console.log(`  has cloud-platform scope: ${scope.includes("cloud-platform")}`);
  }
}

async function testChatgptAuth(verbose: boolean) {
  console.log("🔐 ChatGPT Auth Method Test (Device/API)");

  const sub = chatgptSubscriptionToken();
  const access = openaiKey();
  if (verbose) {
    console.log(`  CHATGPT_SUBSCRIPTION_TOKEN: ${mask(sub)}`);
    console.log(`  OPENAI_API_KEY: ${mask(access)}`);
  }

  if (!sub && !access) {
    console.log("  ❌ Missing CHATGPT_SUBSCRIPTION_TOKEN and OPENAI_API_KEY");
    return;
  }

  if (sub) {
    let bridgeResponse: Response;
    try {
      bridgeResponse = await fetch(subscriptionBridgeUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sub}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "healthcheck" }],
          max_tokens: 16,
        }),
      });
    } catch (e) {
      console.log("  ❌ Could not reach local subscription bridge");
      if (verbose) {
        console.log(`  ↳ ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }

    if (bridgeResponse.status === 401) {
      console.log("  ❌ Subscription token rejected by bridge");
      if (!access) return;
      console.log("  ↳ Falling back to API key auth check");
    } else {
      console.log("  ✅ Subscription token accepted by bridge");
      return;
    }
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${access}` },
    });
  } catch (e) {
    console.log("  ❌ Could not reach OpenAI API endpoint");
    if (verbose) {
      console.log(`  ↳ ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }

  if (!response.ok) {
    console.log(`  ❌ API key validation failed (${response.status})`);
    if (verbose) {
      console.log(`  ↳ ${await response.text()}`);
    }
    return;
  }

  console.log("  ✅ API key accepted by OpenAI");
}

async function testChatgptMode(
  label: string,
  mode: "subscription" | "api",
  apiKey: string,
) {
  console.log(`💎 Testing ChatGPT (${label})...`);
  const chatgpt = new ChatGPTProvider({
    apiKey,
    model: "gpt-4o",
    mode,
  });
  const response = await chatgpt.complete([
    { role: "user", content: "Hello, are you working?" },
  ]);
  console.log(`✅ ChatGPT ${label} Response:`, response.content);
}

function printVerboseEnv() {
  console.log("🔎 Environment Check");
  const keys = [
    "OPENAI_API_KEY",
    "CHATGPT_PLUS_API_KEY",
    "CHATGPT_SUBSCRIPTION_TOKEN",
    "CHATGPT_SUBSCRIPTION_REFRESH_TOKEN",
    "CHATGPT_SUBSCRIPTION_BRIDGE_URL",
    "CHATGPT_SUBSCRIPTION_DEVICE_CODE_URL",
    "CHATGPT_SUBSCRIPTION_TOKEN_URL",
    "SUBSCRIPTION_UPSTREAM_CHAT_COMPLETIONS_URL",
    "SUBSCRIPTION_UPSTREAM_BEARER_TOKEN",
    "GOOGLE_ACCESS_TOKEN",
    "GOOGLE_PROJECT_ID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GEMINI_ACCESS_TOKEN",
    "GEMINI_PROJECT_ID",
    "GEMINI_OAUTH_CLIENT_ID",
    "GEMINI_OAUTH_CLIENT_SECRET",
    "GEMINI_REFRESH_TOKEN",
  ];
  for (const key of keys) {
    const v = value(key);
    const shown =
      key.includes("TOKEN") || key.includes("SECRET") || key.includes("KEY")
        ? mask(v)
        : v || "missing";
    console.log(`  ${key}: ${shown}`);
  }
  console.log("");
}

async function main() {
  syncGeminiEnv();
  const args = new Set(Bun.argv.slice(2));
  const verbose = args.has("--verbose") || args.has("-v");
  const authTest = args.has("--auth-test") || args.has("--auth");

  console.log(
    "🧪 Verifying Subscriptions for shailesh.rawat1403@gmail.com...\n",
  );

  if (verbose) {
    printVerboseEnv();
  }

  if (authTest) {
    await testGeminiAuth(verbose);
    console.log("");
    await testChatgptAuth(verbose);
    console.log("\n--------------------------------\n");
  }

  // 1. Test Gemini
  const gemini = getGeminiOAuthConfig();
  const googleAccess = gemini.accessToken;
  const chatgptKey = openaiKey();
  const chatgptToken = chatgptSubscriptionToken();

  if (!googleAccess && !gemini.refreshToken) {
    console.log("⚠️  Skipping Gemini (missing access token and refresh token)");
  } else {
    console.log("🌟 Testing Gemini Provider...");
    try {
      // @ts-ignore
      const gemini = new GeminiProvider({
        accessToken: googleAccess,
      });
      const response = await gemini.complete([{ role: "user", content: "Hello, are you working?" }]);
      console.log("✅ Gemini Response:", response.content);
    } catch (e) {
      console.error("❌ Gemini Failed:", e instanceof Error ? e.message : e);
    }
  }

  console.log("\n--------------------------------\n");

  // 2. Test ChatGPT
  if (chatgptToken) {
    try {
      await testChatgptMode("Subscription Mode", "subscription", chatgptKey);
    } catch (e) {
      console.error("❌ ChatGPT Subscription Failed:", e instanceof Error ? e.message : e);
    }
  }

  if (chatgptKey) {
    try {
      await testChatgptMode("API Mode", "api", chatgptKey);
    } catch (e) {
      console.error("❌ ChatGPT API Failed:", e instanceof Error ? e.message : e);
    }
  }

  if (!chatgptKey && !chatgptToken) {
    console.log("⚠️  Skipping ChatGPT (missing subscription token and API key)");
  } else {
    console.log("💡 Modes are isolated: subscription and API key paths are verified separately.");
  }
}

main();
