import { createHash, randomUUID } from "crypto"
import { and, desc, eq, ne } from "drizzle-orm"
import { db, initDb } from "../db/index.js"
import { pmEvents, pmState, projects } from "../db/schema.js"
import { defaultPMState, type AllowRule, type PMState } from "./types.js"

initDb()

let pmWriteCount = 0

export function getPmWriteCount() {
  return pmWriteCount
}

export function resetPmWriteCountForTests() {
  pmWriteCount = 0
}

function projectId(workDir: string, gitRemote?: string) {
  return `prj_${createHash("sha256").update(`${workDir}|${gitRemote || ""}`).digest("hex").slice(0, 16)}`
}

export async function getOrCreateProject(userId: string, workDir: string, gitRemote?: string) {
  const id = projectId(workDir, gitRemote)
  const row = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  })
  if (row) return row
  const [created] = await db
    .insert(projects)
    .values({
      id,
      user_id: userId,
      work_dir: workDir,
      git_remote: gitRemote || null,
    })
    .returning()
  return created
}

export async function loadPM(projectId: string) {
  const row = await db.query.pmState.findFirst({
    where: eq(pmState.project_id, projectId),
  })
  if (!row) return defaultPMState(projectId)
  const state = row.state_json as unknown as PMState & {
    constraints?: { always_allow?: AllowRule[] | string[] }
  }
  const allow = state.constraints?.always_allow || []
  const normalized = allow.map((rule) =>
    typeof rule === "string"
      ? { kind: "tool", pattern: rule }
      : rule,
  )
  return {
    ...state,
    constraints: {
      ...(state.constraints || {}),
      always_allow: normalized,
    },
  } as PMState
}

export async function savePM(
  projectId: string,
  update: Partial<PMState>,
  meta?: { command?: string; actor?: string; note?: string; event_type?: "update" | "undo" | "rao_purge" },
) {
  pmWriteCount += 1
  const current = await loadPM(projectId)
  const next: PMState = {
    ...current,
    ...update,
    constraints: {
      ...current.constraints,
      ...(update.constraints || {}),
    },
    preferences: {
      ...current.preferences,
      ...(update.preferences || {}),
    },
    recent_outcomes: update.recent_outcomes || current.recent_outcomes,
    rao: meta?.event_type === "undo" ? current.rao : (update.rao || current.rao),
    last_updated: new Date().toISOString(),
    project_id: projectId,
  }
  const existing = await db.query.pmState.findFirst({
    where: eq(pmState.project_id, projectId),
  })
  if (existing) {
    await db
      .update(pmState)
      .set({
        state_json: next as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .where(eq(pmState.project_id, projectId))
    if (meta?.command) {
      await appendPMEvent(projectId, {
        command: meta.command,
        before: current,
        after: next,
        actor: meta.actor,
        note: meta.note,
        event_type: meta.event_type || "update",
      })
    }
    return next
  }
  await db.insert(pmState).values({
    project_id: projectId,
    state_json: next as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
  if (meta?.command) {
    await appendPMEvent(projectId, {
      command: meta.command,
      before: current,
      after: next,
      actor: meta.actor,
      note: meta.note,
      event_type: meta.event_type || "update",
    })
  }
  return next
}

export async function appendPMEvent(
  projectId: string,
  input: {
    command: string
    before: PMState
    after: PMState
    actor?: string
    note?: string
    event_type?: "update" | "undo" | "rao_purge"
  },
) {
  pmWriteCount += 1
  await db.insert(pmEvents).values({
    id: `pme_${randomUUID()}`,
    project_id: projectId,
    ts: new Date().toISOString(),
    actor: input.actor || "user",
    command: input.command,
    before_json: input.before as unknown as Record<string, unknown>,
    after_json: input.after as unknown as Record<string, unknown>,
    note: input.note || null,
    event_type: input.event_type || "update",
  })
}

export async function listPMEvents(projectId: string, limit = 20) {
  return await db
    .select()
    .from(pmEvents)
    .where(eq(pmEvents.project_id, projectId))
    .orderBy(desc(pmEvents.ts))
    .limit(limit)
}

export async function getPMEvent(projectId: string, eventId: string) {
  return await db.query.pmEvents.findFirst({
    where: and(eq(pmEvents.project_id, projectId), eq(pmEvents.id, eventId)),
  })
}

export function formatPMEventDiff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
}

export async function undoLastPMEvent(projectId: string) {
  pmWriteCount += 1
  const row = await db.query.pmEvents.findFirst({
    where: and(
      eq(pmEvents.project_id, projectId),
      ne(pmEvents.event_type, "undo"),
      ne(pmEvents.event_type, "rao_purge"),
    ),
    orderBy: desc(pmEvents.ts),
  })
  if (!row) return null
  const before = row.before_json as unknown as PMState
  const restored = await savePM(projectId, before, {
    command: "/pm undo",
    note: `undo:${row.id}`,
    event_type: "undo",
  })
  return restored
}
