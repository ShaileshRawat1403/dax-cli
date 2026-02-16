import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { getDb, initDb } from "./db/index"

try {
  initDb()
  migrate(getDb(), { migrationsFolder: "drizzle" })
  console.log("✅ Migrations applied successfully")
  process.exit(0)
} catch (e) {
  console.error("❌ Migration failed", e)
  process.exit(1)
}
