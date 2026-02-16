import { randomUUID } from "crypto";
import { db } from "./db/index.js";
import { users, sessions, apiTokens, auditLogs } from "./db/auth-schema.js";
import { eq, and, gt } from "drizzle-orm";
import type { Context, Next } from "hono";

// Password hashing using Bun's built-in crypto
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const hashedPassword = await hashPassword(password);
  return hashedPassword === hash;
}

// Generate secure token
export function generateToken(): string {
  return `tok_${randomUUID().replace(/-/g, "")}`;
}

// Session management
export async function createSession(userId: string, ipAddress?: string, userAgent?: string) {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  await db.insert(sessions).values({
    id: randomUUID(),
    user_id: userId,
    token,
    created_at: now,
    expires_at: expiresAt,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  return { token, expiresAt };
}

export async function validateSession(token: string) {
  const session = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.token, token),
        gt(sessions.expires_at, new Date())
      )
    )
    .get();

  if (!session) {
    return null;
  }

  // Get user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user_id))
    .get();

  if (!user || !user.is_active) {
    return null;
  }

  return { session, user };
}

export async function revokeSession(token: string) {
  await db
    .delete(sessions)
    .where(eq(sessions.token, token));
}

// API Token management
export async function createApiToken(userId: string, name: string) {
  const token = generateToken();
  const tokenHash = await hashPassword(token); // Hash the token for storage
  const now = new Date();

  await db.insert(apiTokens).values({
    id: randomUUID(),
    user_id: userId,
    name,
    token_hash: tokenHash,
    created_at: now,
    is_active: true,
  });

  return token; // Return the plain token (only shown once)
}

export async function validateApiToken(token: string) {
  const tokenHash = await hashPassword(token);
  
  const apiToken = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.token_hash, tokenHash),
        eq(apiTokens.is_active, true)
      )
    )
    .get();

  if (!apiToken) {
    return null;
  }

  // Check expiration
  if (apiToken.expires_at && apiToken.expires_at < new Date()) {
    return null;
  }

  // Update last used
  await db
    .update(apiTokens)
    .set({ last_used: new Date() })
    .where(eq(apiTokens.id, apiToken.id));

  // Get user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, apiToken.user_id))
    .get();

  if (!user || !user.is_active) {
    return null;
  }

  return { apiToken, user };
}

// Authentication middleware
export async function authMiddleware(c: Context, next: Next) {
  // Check for Authorization header
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader) {
    return c.json({ error: "Unauthorized: No authorization header" }, 401);
  }

  // Check for Bearer token
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const result = await validateSession(token) || await validateApiToken(token);
    
    if (!result) {
      return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
    }

    // Set user in context
    c.set("user", result.user);
    c.set("authMethod", "session" in result ? "session" : "api_token");
  } else {
    return c.json({ error: "Unauthorized: Invalid authorization format" }, 401);
  }

  await next();
}

// Optional auth middleware (allows both authenticated and anonymous requests)
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const result = await validateSession(token) || await validateApiToken(token);
    
    if (result) {
      c.set("user", result.user);
      c.set("authMethod", "session" in result ? "session" : "api_token");
    }
  }

  await next();
}

// Role-based access control middleware
export function requireRole(...allowedRoles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    
    if (!user) {
      return c.json({ error: "Unauthorized: Authentication required" }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: "Forbidden: Insufficient permissions" }, 403);
    }

    await next();
  };
}

// Audit logging
export async function logAudit(
  action: string,
  options: {
    userId?: string;
    resource?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    success?: boolean;
  } = {}
) {
  const {
    userId,
    resource,
    details,
    ipAddress,
    userAgent,
    success = true,
  } = options;

  await db.insert(auditLogs).values({
    id: randomUUID(),
    user_id: userId,
    action,
    resource,
    details: details ? JSON.stringify(details) : null,
    ip_address: ipAddress,
    user_agent: userAgent,
    timestamp: new Date(),
    success,
  });
}

// Audit middleware
export function auditMiddleware(action: string) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    const startTime = Date.now();
    
    try {
      await next();
      
      // Log successful request
      await logAudit(action, {
        userId: user?.id,
        resource: c.req.path,
        details: {
          method: c.req.method,
          duration: Date.now() - startTime,
          status: c.res.status,
        },
        ipAddress: c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP"),
        userAgent: c.req.header("User-Agent"),
        success: true,
      });
    } catch (error) {
      // Log failed request
      await logAudit(action, {
        userId: user?.id,
        resource: c.req.path,
        details: {
          method: c.req.method,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        },
        ipAddress: c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP"),
        userAgent: c.req.header("User-Agent"),
        success: false,
      });
      
      throw error;
    }
  };
}
