import { rm } from "node:fs/promises"
import { createTestDbPath, initDb, resetDbForTests } from "../db/index.js"

export async function bootTestDb(prefix = "dax") {
  const path = createTestDbPath(prefix)
  initDb({ path, journalMode: "DELETE" })
  return path
}

export async function cleanupTestDb(path: string) {
  resetDbForTests()
  await rm(path, { force: true })
  await rm(`${path}-wal`, { force: true })
  await rm(`${path}-shm`, { force: true })
  initDb()
}
