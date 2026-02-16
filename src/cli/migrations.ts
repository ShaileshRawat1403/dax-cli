import { join } from "path"
import { mkdir } from "node:fs/promises"

const pairs = [
  ["DAX_API_URL", "COGNITO_API_URL"],
  ["DAX_ORCHESTRATOR_ONLY", "COGNITO_ORCHESTRATOR_ONLY"],
  ["DAX_HISTORY_PATH", "COGNITO_HISTORY_PATH"],
  ["DAX_HISTORY_LIMIT", "COGNITO_HISTORY_LIMIT"],
  ["DAX_POLICY", "COGNITO_POLICY"],
  ["DAX_USER_ID", "COGNITO_USER_ID"],
  ["DAX_DB_PATH", "COGNITO_DB_PATH"],
]

export async function warnLegacyEnvOnce(workDir: string) {
  const legacy = pairs.some(([next, old]) => !process.env[next] && Boolean(process.env[old]))
  if (!legacy) return false
  const file = join(workDir, ".dax", "migrations", "env_v1_warned")
  const marker = Bun.file(file)
  if (await marker.exists()) return false
  await mkdir(join(workDir, ".dax", "migrations"), { recursive: true })
  await Bun.write(file, `${new Date().toISOString()}\n`)
  return true
}
