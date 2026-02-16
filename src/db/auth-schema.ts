import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Users table for authentication
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().default("user"), // user, admin
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp" }).notNull(),
  last_login: integer("last_login", { mode: "timestamp" }),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// API tokens for programmatic access
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  name: text("name").notNull(),
  token_hash: text("token_hash").notNull().unique(),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
  expires_at: integer("expires_at", { mode: "timestamp" }),
  last_used: integer("last_used", { mode: "timestamp" }),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Sessions for web authentication
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
  expires_at: integer("expires_at", { mode: "timestamp" }).notNull(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
});

// Rate limiting
export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull(), // IP address or user ID
  endpoint: text("endpoint").notNull(),
  count: integer("count").notNull().default(0),
  window_start: integer("window_start", { mode: "timestamp" }).notNull(),
});

// Audit log
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  user_id: text("user_id"),
  action: text("action").notNull(), // login, logout, tool_call, file_write, etc.
  resource: text("resource"), // file path, agent ID, etc.
  details: text("details", { mode: "json" }),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  success: integer("success", { mode: "boolean" }).notNull(),
});
