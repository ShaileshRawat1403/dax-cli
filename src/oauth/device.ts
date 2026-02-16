import { randomUUID } from "crypto";
import { Database } from "bun:sqlite";

const EXPIRES_IN = 600;
const INTERVAL = 5;
const db = new Database(process.env.DAX_DB_PATH || process.env.COGNITO_DB_PATH || "cognito.db");

db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_device_sessions (
    device_code TEXT PRIMARY KEY,
    user_code TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    client_id TEXT,
    scope TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    subscription_plan TEXT NOT NULL DEFAULT 'active'
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS oauth_device_sessions_expires_idx
  ON oauth_device_sessions(expires_at)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS oauth_device_sessions_access_token_idx
  ON oauth_device_sessions(access_token)
`);

function now() {
  return Math.floor(Date.now() / 1000);
}

function cleanExpired() {
  const stmt = db.query(
    "DELETE FROM oauth_device_sessions WHERE expires_at <= ?",
  );
  stmt.run(now());
}

function userCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  const part2 = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  return `${part}-${part2}`;
}

function getByDeviceCode(device_code: string) {
  const stmt = db.query(
    "SELECT * FROM oauth_device_sessions WHERE device_code = ? LIMIT 1",
  );
  return stmt.get(device_code) as
    | {
        device_code: string;
        user_code: string;
        provider: string;
        client_id: string | null;
        scope: string | null;
        status: "pending" | "approved" | "expired";
        created_at: number;
        expires_at: number;
        access_token: string | null;
        refresh_token: string | null;
        subscription_plan: string | null;
      }
    | undefined;
}

function getByRefreshToken(refresh_token: string) {
  const stmt = db.query(
    "SELECT * FROM oauth_device_sessions WHERE refresh_token = ? LIMIT 1",
  );
  return stmt.get(refresh_token) as
    | {
        device_code: string;
        user_code: string;
        provider: string;
        client_id: string | null;
        scope: string | null;
        status: "pending" | "approved" | "expired";
        created_at: number;
        expires_at: number;
        access_token: string | null;
        refresh_token: string | null;
        subscription_plan: string | null;
      }
    | undefined;
}

function getByUserCode(user_code: string) {
  const stmt = db.query(
    "SELECT * FROM oauth_device_sessions WHERE user_code = ? LIMIT 1",
  );
  return stmt.get(user_code) as
    | {
        device_code: string;
        user_code: string;
        provider: string;
        client_id: string | null;
        scope: string | null;
        status: "pending" | "approved" | "expired";
        created_at: number;
        expires_at: number;
        access_token: string | null;
        refresh_token: string | null;
        subscription_plan: string | null;
      }
    | undefined;
}

export function issueDeviceCode(input: {
  provider: string;
  client_id?: string;
  scope?: string;
  base_url: string;
}) {
  cleanExpired();
  const device_code = randomUUID();
  const code = userCode();
  const created = now();
  const expires = created + EXPIRES_IN;
  const insert = db.query(
    `INSERT INTO oauth_device_sessions
      (device_code, user_code, provider, client_id, scope, status, created_at, expires_at, subscription_plan)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 'active')`,
  );
  insert.run(
    device_code,
    code,
    input.provider,
    input.client_id || null,
    input.scope || null,
    created,
    expires,
  );

  return {
    device_code,
    user_code: code,
    verification_uri: `${input.base_url}/oauth/device/verify`,
    verification_uri_complete: `${input.base_url}/oauth/device/verify?user_code=${encodeURIComponent(code)}`,
    expires_in: EXPIRES_IN,
    interval: INTERVAL,
  };
}

export function approveUserCode(user_code: string) {
  cleanExpired();
  const session = getByUserCode(user_code);
  if (!session) return null;
  if (session.expires_at <= now()) {
    const expire = db.query(
      "UPDATE oauth_device_sessions SET status = 'expired' WHERE device_code = ?",
    );
    expire.run(session.device_code);
    return null;
  }

  const access = session.access_token || `sub_${randomUUID().replace(/-/g, "")}`;
  const refresh = session.refresh_token || `ref_${randomUUID().replace(/-/g, "")}`;
  const approve = db.query(
    `UPDATE oauth_device_sessions
     SET status = 'approved', access_token = ?, refresh_token = ?
     WHERE device_code = ?`,
  );
  approve.run(access, refresh, session.device_code);
  return {
    ...session,
    status: "approved" as const,
    access_token: access,
    refresh_token: refresh,
  };
}

export function exchangeDeviceCode(input: {
  grant_type?: string;
  device_code?: string;
  client_id?: string;
  refresh_token?: string;
}) {
  cleanExpired();
  if (input.grant_type === "refresh_token") {
    if (!input.refresh_token) {
      return { status: 400, body: { error: "invalid_request" } };
    }
    const session = getByRefreshToken(input.refresh_token);
    if (!session) {
      return { status: 400, body: { error: "invalid_grant" } };
    }
    if (session.status !== "approved") {
      return { status: 400, body: { error: "invalid_grant" } };
    }
    const created = now();
    const expires = created + EXPIRES_IN;
    const access = `sub_${randomUUID().replace(/-/g, "")}`;
    const update = db.query(
      `UPDATE oauth_device_sessions
       SET access_token = ?, expires_at = ?, status = 'approved'
       WHERE device_code = ?`,
    );
    update.run(access, expires, session.device_code);
    return {
      status: 200,
      body: {
        access_token: access,
        refresh_token: session.refresh_token,
        token_type: "Bearer",
        expires_in: EXPIRES_IN,
        scope: session.scope || "",
        provider: session.provider,
        subscription_plan: session.subscription_plan || "active",
      },
    };
  }
  if (input.grant_type !== "urn:ietf:params:oauth:grant-type:device_code") {
    return { status: 400, body: { error: "unsupported_grant_type" } };
  }
  if (!input.device_code) {
    return { status: 400, body: { error: "invalid_request" } };
  }

  const session = getByDeviceCode(input.device_code);
  if (!session) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  if (session.expires_at <= now()) {
    const expire = db.query(
      "UPDATE oauth_device_sessions SET status = 'expired' WHERE device_code = ?",
    );
    expire.run(session.device_code);
    return { status: 400, body: { error: "expired_token" } };
  }
  if (session.client_id && input.client_id && session.client_id !== input.client_id) {
    return { status: 400, body: { error: "invalid_client" } };
  }
  if (session.status !== "approved") {
    return { status: 400, body: { error: "authorization_pending" } };
  }

  return {
    status: 200,
    body: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: "Bearer",
      expires_in: Math.max(0, session.expires_at - now()),
      scope: session.scope || "",
      provider: session.provider,
      subscription_plan: session.subscription_plan || "active",
    },
  };
}

export function validateSubscriptionToken(token: string) {
  cleanExpired();
  const stmt = db.query(
    "SELECT provider, subscription_plan, scope, expires_at FROM oauth_device_sessions WHERE access_token = ? LIMIT 1",
  );
  const session = stmt.get(token) as
    | {
        provider: string;
        subscription_plan: string | null;
        scope: string | null;
        expires_at: number;
      }
    | undefined;
  if (!session) return null;
  if (session.expires_at <= now()) return null;
  return {
    provider: session.provider,
    plan: session.subscription_plan || "active",
    scope: session.scope || "",
  };
}

export function verifyDevicePage(user_code: string, approve: boolean) {
  const found = getByUserCode(user_code);
  if (!found) {
    return {
      status: 404,
      html: `<h1>Invalid code</h1><p>User code not found.</p>`,
    };
  }

  if (approve) {
    const ok = approveUserCode(user_code);
    if (!ok) {
      return {
        status: 410,
        html: `<h1>Code expired</h1><p>Try login again from CLI.</p>`,
      };
    }
    return {
      status: 200,
      html: `<h1>You're all set</h1><p>You can return to the terminal now.</p>`,
    };
  }

  return {
    status: 200,
    html: `<html><body><h1>Authorize Device</h1><p>Code: <b>${user_code}</b></p><p>Provider: ${found.provider}</p><a href="?user_code=${encodeURIComponent(user_code)}&approve=1">Authorize</a></body></html>`,
  };
}
