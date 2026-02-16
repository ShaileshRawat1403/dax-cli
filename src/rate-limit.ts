import { db } from "./db/index.js";
import { rateLimits } from "./db/auth-schema.js";
import { eq, and, lt } from "drizzle-orm";
import type { Context, Next } from "hono";

// Rate limit configuration
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
}

// Default rate limits by endpoint
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  default: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },
  "/api/agent/start": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // Expensive operation
  },
  "/api/agent/*/continue": {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  "/api/work-notes": {
    windowMs: 60 * 1000,
    maxRequests: 60,
  },
};

// Get client identifier (IP address or user ID)
function getClientId(c: Context): string {
  // Check for user ID from authentication
  const user = c.get("user");
  if (user?.id) {
    return `user:${user.id}`;
  }
  
  // Fall back to IP address
  const forwarded = c.req.header("X-Forwarded-For");
  const realIp = c.req.header("X-Real-IP");
  const ip = forwarded || realIp || "unknown";
  
  return `ip:${ip}`;
}

// Get rate limit config for endpoint
function getRateLimitConfig(path: string): RateLimitConfig {
  // Check for exact match
  if (DEFAULT_LIMITS[path]) {
    return DEFAULT_LIMITS[path];
  }
  
  // Check for wildcard patterns
  for (const [pattern, config] of Object.entries(DEFAULT_LIMITS)) {
    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      if (regex.test(path)) {
        return config;
      }
    }
  }
  
  return DEFAULT_LIMITS.default;
}

// Check if request is within rate limit
async function isRateLimited(
  clientId: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<{ limited: boolean; remaining: number; resetTime: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMs);
  const key = `${clientId}:${endpoint}`;
  
  // Clean up old entries
  await db
    .delete(rateLimits)
    .where(lt(rateLimits.window_start, windowStart));
  
  // Get or create rate limit record
  let record = await db
    .select()
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.key, key),
        eq(rateLimits.endpoint, endpoint)
      )
    )
    .get();
  
  if (!record) {
    // Create new record
    await db.insert(rateLimits).values({
      id: crypto.randomUUID(),
      key,
      endpoint,
      count: 1,
      window_start: now,
    });
    
    return {
      limited: false,
      remaining: config.maxRequests - 1,
      resetTime: now.getTime() + config.windowMs,
    };
  }
  
  // Check if window has expired
  if (record.window_start < windowStart) {
    // Reset window
    await db
      .update(rateLimits)
      .set({
        count: 1,
        window_start: now,
      })
      .where(eq(rateLimits.id, record.id));
    
    return {
      limited: false,
      remaining: config.maxRequests - 1,
      resetTime: now.getTime() + config.windowMs,
    };
  }
  
  // Check if limit exceeded
  if (record.count >= config.maxRequests) {
    return {
      limited: true,
      remaining: 0,
      resetTime: record.window_start.getTime() + config.windowMs,
    };
  }
  
  // Increment count
  await db
    .update(rateLimits)
    .set({ count: record.count + 1 })
    .where(eq(rateLimits.id, record.id));
  
  return {
    limited: false,
    remaining: config.maxRequests - record.count - 1,
    resetTime: record.window_start.getTime() + config.windowMs,
  };
}

// Rate limiting middleware factory
export function rateLimit(config?: Partial<RateLimitConfig>) {
  return async (c: Context, next: Next) => {
    const clientId = getClientId(c);
    const path = c.req.path;
    const limitConfig = { ...getRateLimitConfig(path), ...config };
    
    const result = await isRateLimited(clientId, path, limitConfig);
    
    // Set rate limit headers
    c.header("X-RateLimit-Limit", limitConfig.maxRequests.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, result.remaining).toString());
    c.header("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000).toString());
    
    if (result.limited) {
      return c.json(
        {
          error: "Too many requests",
          message: `Rate limit exceeded. Try again after ${new Date(result.resetTime).toISOString()}`,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
        429
      );
    }
    
    await next();
  };
}

// Global rate limiting middleware (applies to all routes)
export async function globalRateLimit(c: Context, next: Next) {
  const clientId = getClientId(c);
  const path = c.req.path;
  const config = getRateLimitConfig(path);
  
  const result = await isRateLimited(clientId, path, config);
  
  // Set rate limit headers
  c.header("X-RateLimit-Limit", config.maxRequests.toString());
  c.header("X-RateLimit-Remaining", Math.max(0, result.remaining).toString());
  c.header("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000).toString());
  
  if (result.limited) {
    return c.json(
      {
        error: "Too many requests",
        message: `Rate limit exceeded. Try again after ${new Date(result.resetTime).toISOString()}`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      },
      429
    );
  }
  
  await next();
}

// IP-based rate limiting (for unauthenticated requests)
export async function ipRateLimit(c: Context, next: Next) {
  // Skip if user is authenticated
  const user = c.get("user");
  if (user) {
    await next();
    return;
  }
  
  const forwarded = c.req.header("X-Forwarded-For");
  const realIp = c.req.header("X-Real-IP");
  const ip = forwarded || realIp || "unknown";
  const path = c.req.path;
  
  const config = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // Stricter limit for unauthenticated users
  };
  
  const result = await isRateLimited(`ip:${ip}`, path, config);
  
  c.header("X-RateLimit-Limit", config.maxRequests.toString());
  c.header("X-RateLimit-Remaining", Math.max(0, result.remaining).toString());
  
  if (result.limited) {
    return c.json(
      {
        error: "Too many requests",
        message: "Rate limit exceeded for unauthenticated requests. Please authenticate.",
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      },
      429
    );
  }
  
  await next();
}
