import { createHash, randomBytes } from "crypto";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function first(names: string[]) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

export function syncGeminiEnv() {
  const pairs = [
    ["GOOGLE_CLIENT_ID", "GEMINI_OAUTH_CLIENT_ID"],
    ["GOOGLE_CLIENT_SECRET", "GEMINI_OAUTH_CLIENT_SECRET"],
    ["GOOGLE_PROJECT_ID", "GEMINI_PROJECT_ID"],
    ["GOOGLE_ACCESS_TOKEN", "GEMINI_ACCESS_TOKEN"],
    ["GOOGLE_REFRESH_TOKEN", "GEMINI_REFRESH_TOKEN"],
  ];

  for (const [googleKey, geminiKey] of pairs) {
    if (!env(googleKey)) {
      const value = env(geminiKey);
      if (value) process.env[googleKey] = value;
    }
  }
}

export function getGeminiOAuthConfig() {
  syncGeminiEnv();
  return {
    clientId: first(["GOOGLE_CLIENT_ID", "GEMINI_OAUTH_CLIENT_ID"]),
    clientSecret: first(["GOOGLE_CLIENT_SECRET", "GEMINI_OAUTH_CLIENT_SECRET"]),
    projectId: first(["GOOGLE_PROJECT_ID", "GEMINI_PROJECT_ID"]),
    accessToken: first(["GOOGLE_ACCESS_TOKEN", "GEMINI_ACCESS_TOKEN"]),
    refreshToken: first(["GOOGLE_REFRESH_TOKEN", "GEMINI_REFRESH_TOKEN"]),
  };
}

function base64url(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function authenticateGemini(
  clientId: string,
  clientSecret?: string,
  loginHint?: string,
) {
  syncGeminiEnv();
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(sha256(verifier));
  const scope = [
    "https://www.googleapis.com/auth/cloud-platform",
    "openid",
    "email",
    "profile",
  ].join(" ");
  const redirectUri = "http://127.0.0.1:53682/oauth2callback";

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);

  if (loginHint) {
    url.searchParams.set("login_hint", loginHint);
  }

  console.log("\n🌐 Gemini OAuth URL (open manually if needed):");
  console.log(url.toString());
  console.log("");

  let fail = "";
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.stop();
      reject(new Error("Google OAuth timed out after 3 minutes."));
    }, 180000);

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 53682,
      fetch(req) {
        const reqUrl = new URL(req.url);
        if (reqUrl.pathname !== "/oauth2callback") {
          return new Response("Not found", { status: 404 });
        }

        const err = reqUrl.searchParams.get("error");
        if (err) {
          fail = err;
          clearTimeout(timer);
          setTimeout(() => server.stop(), 0);
          reject(new Error(`Google OAuth failed: ${err}`));
          return new Response("Google authentication failed. You can close this tab.");
        }

        const value = reqUrl.searchParams.get("code");
        if (!value) {
          clearTimeout(timer);
          setTimeout(() => server.stop(), 0);
          reject(new Error("Google OAuth did not return an authorization code."));
          return new Response("Missing authorization code. You can close this tab.");
        }

        clearTimeout(timer);
        setTimeout(() => server.stop(), 0);
        resolve(value);
        return new Response("Authentication successful. You can close this tab.");
      },
    });

    const target = url.toString();
    const openCmd = Bun.which("open");
    const xdgOpenCmd = Bun.which("xdg-open");

    if (openCmd) {
      Bun.spawn([openCmd, target], { stderr: "ignore", stdout: "ignore" });
      return;
    }

    if (xdgOpenCmd) {
      Bun.spawn([xdgOpenCmd, target], { stderr: "ignore", stdout: "ignore" });
      return;
    }

    console.log("⚠️ Could not auto-open a browser. Paste the URL above into your browser.");
  });

  if (!code) {
    throw new Error(
      fail
        ? `Google OAuth failed before token exchange: ${fail}`
        : "Google OAuth did not produce an authorization code.",
    );
  }

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");
  body.set("code_verifier", verifier);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }

  return await response.json();
}

export async function refreshGeminiAccessToken(
  clientId: string,
  clientSecret: string | undefined,
  refreshToken: string,
) {
  syncGeminiEnv();
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Google refresh token exchange failed: ${response.status} ${await response.text()}`,
    );
  }

  return await response.json();
}

export async function resolveGeminiAccessToken() {
  const config = getGeminiOAuthConfig();
  const access = config.accessToken;
  if (access) return access;

  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  const refreshToken = config.refreshToken;

  if (!clientId || !refreshToken) {
    throw new Error(
      "GOOGLE_ACCESS_TOKEN missing and refresh credentials are incomplete. Run '/connect' for Gemini OAuth.",
    );
  }

  const refreshed = await refreshGeminiAccessToken(
    clientId,
    clientSecret,
    refreshToken,
  );
  const token = refreshed.access_token?.trim() || "";

  if (!token) {
    throw new Error("Google refresh token response did not include access_token.");
  }

  process.env.GOOGLE_ACCESS_TOKEN = token;
  return token;
}
