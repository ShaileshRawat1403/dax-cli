import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// We use text({ mode: 'json' }) to store complex objects in SQLite.
// The .$type<T>() method provides type-safety when you query the data.

export const workNotes = sqliteTable("work_notes", {
  id: text("id").primaryKey(),
  created: text("created").notNull(),
  intent: text("intent", { mode: "json" })
    .$type<{ what: string; why: string }>()
    .notNull(),
  hypothesis: text("hypothesis", { mode: "json" })
    .$type<{ expected: string; metrics: string[] }>()
    .notNull(),
  plan: text("plan", { mode: "json" })
    .$type<{ steps: string[]; alternatives: string[]; rationale: string }>()
    .notNull(),
  scope: text("scope", { mode: "json" })
    .$type<{ files: string[]; max_files: number; max_loc: number }>()
    .notNull(),
  assumptions: text("assumptions", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  risks: text("risks", { mode: "json" })
    .$type<{ technical: string[]; behavioral: string[] }>()
    .notNull(),
  status: text("status").notNull(),
});

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  project_id: text("project_id"),
  timestamp: text("timestamp").notNull(),
  context: text("context").notNull(),
  decision: text("decision").notNull(),
  rationale: text("rationale").notNull(),
  alternatives: text("alternatives", { mode: "json" })
    .$type<{ name: string; reason_rejected: string }[]>()
    .notNull(),
  confidence: text("confidence").notNull(),
  reversible: integer("reversible", { mode: "boolean" }).notNull(),
});

type Metrics = {
  avg_latency: string;
  p99_latency: string;
  memory: string;
  tests_passed: string;
};

export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  variant_a: text("variant_a", { mode: "json" })
    .$type<{
      label: string;
      description: string;
      metrics: Metrics;
    }>()
    .notNull(),
  variant_b: text("variant_b", { mode: "json" })
    .$type<{
      label: string;
      description: string;
      metrics: Metrics;
    }>()
    .notNull(),
  deltas: text("deltas", { mode: "json" })
    .$type<{
      avg_latency: string;
      p99_latency: string;
      memory: string;
      tests_passed: string;
    }>()
    .notNull(),
  verdict: text("verdict").notNull(),
});

export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(), // e.g., 'error_handling'
  rules: text("rules", { mode: "json" }).$type<string[]>().notNull(),
  enforced: integer("enforced", { mode: "boolean" }).notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  task: text("task").notNull(),
  mode: text("mode").notNull(),
  provider: text("provider"),
  status: text("status").notNull().default("running"),
  requireApproval: integer("require_approval", { mode: "boolean" }).default(
    true,
  ),
  conversation: text("conversation", { mode: "json" }).$type<any[]>(),
  workNotes: text("work_notes", { mode: "json" }).$type<any>(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  work_dir: text("work_dir").notNull(),
  git_remote: text("git_remote"),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const pmState = sqliteTable("pm_state", {
  project_id: text("project_id").primaryKey(),
  state_json: text("state_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const pmEvents = sqliteTable("pm_events", {
  id: text("id").primaryKey(),
  project_id: text("project_id").notNull(),
  ts: text("ts").notNull(),
  actor: text("actor"),
  command: text("command").notNull(),
  before_json: text("before_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  after_json: text("after_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  note: text("note"),
  event_type: text("event_type").notNull().default("update"),
});
