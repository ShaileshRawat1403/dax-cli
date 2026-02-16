import { randomUUID } from "crypto"
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import * as schema from "./schema.js"

let sqlite: Database | null = null
let activePath = ""
let initialized = false

export let db = null as unknown as BunSQLiteDatabase<typeof schema>

function dbPath(path?: string) {
  return path || process.env.DAX_DB_PATH || process.env.COGNITO_DB_PATH || "cognito.db"
}

function initDatabase(conn: Database) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS work_notes (
      id TEXT PRIMARY KEY,
      created TEXT NOT NULL,
      intent TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      plan TEXT NOT NULL,
      scope TEXT NOT NULL,
      assumptions TEXT NOT NULL,
      risks TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      timestamp TEXT NOT NULL,
      context TEXT NOT NULL,
      decision TEXT NOT NULL,
      rationale TEXT NOT NULL,
      alternatives TEXT NOT NULL,
      confidence TEXT NOT NULL,
      reversible INTEGER NOT NULL
    )
  `)

  const decisionColumns = conn
    .query("PRAGMA table_info(decisions)")
    .all() as { name: string }[]
  if (!decisionColumns.some((row) => row.name === "project_id")) {
    conn.exec("ALTER TABLE decisions ADD COLUMN project_id TEXT")
  }

  conn.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      variant_a TEXT NOT NULL,
      variant_b TEXT NOT NULL,
      deltas TEXT NOT NULL,
      verdict TEXT NOT NULL
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      rules TEXT NOT NULL,
      enforced INTEGER NOT NULL
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      work_dir TEXT NOT NULL,
      git_remote TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS pm_state (
      project_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS pm_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      actor TEXT,
      command TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      note TEXT,
      event_type TEXT NOT NULL DEFAULT 'update'
    )
  `)

  conn.exec(`
    CREATE INDEX IF NOT EXISTS pm_events_project_ts_idx
    ON pm_events(project_id, ts)
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      last_used INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL
    )
  `)

  conn.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      timestamp INTEGER NOT NULL,
      success INTEGER NOT NULL
    )
  `)

  conn.exec(`
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
  `)

  conn.exec(`
    CREATE INDEX IF NOT EXISTS oauth_device_sessions_expires_idx
    ON oauth_device_sessions(expires_at)
  `)

  conn.exec(`
    CREATE INDEX IF NOT EXISTS oauth_device_sessions_access_token_idx
    ON oauth_device_sessions(access_token)
  `)
}

export function initDb(opts?: { path?: string; journalMode?: "WAL" | "DELETE" }) {
  const path = dbPath(opts?.path)
  const mode = opts?.journalMode || (process.env.NODE_ENV === "test" ? "DELETE" : "WAL")
  const debug = process.env.DAX_DEBUG_DB === "true"
  if (sqlite && activePath === path) {
    if (debug) console.log(`[db] init reused path=${path} journal=${mode}`)
    return db
  }
  if (sqlite && activePath !== path) sqlite.close()

  initialized = false
  sqlite = new Database(path)
  activePath = path
  db = drizzle(sqlite, { schema })
  sqlite.exec("PRAGMA busy_timeout = 3000;")
  sqlite.exec("PRAGMA foreign_keys = ON;")
  try {
    sqlite.exec(`PRAGMA journal_mode = ${mode};`)
  } catch {
    // Another process may hold a lock; keep default journal mode.
  }
  initDatabase(sqlite)
  initialized = true
  if (debug) console.log(`[db] init reopened path=${path} journal=${mode}`)
  return db
}

export function closeDb() {
  if (sqlite) sqlite.close()
  sqlite = null
  activePath = ""
  initialized = false
}

export function resetDbForTests() {
  closeDb()
}

export function getDb() {
  if (!initialized || !sqlite) {
    throw new Error("Database not initialized. Call initDb() first.")
  }
  return db
}

export function createTestDbPath(prefix = "dax-test") {
  return `/tmp/${prefix}-${randomUUID()}.db`
}
