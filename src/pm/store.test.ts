import { describe, expect, test } from "bun:test"
import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { pmEvents } from "../db/schema.js"
import { getOrCreateProject, getPMEvent, listPMEvents, loadPM, savePM, undoLastPMEvent } from "./store.js"


describe("pm store", () => {
  test("writes events and supports undo", async () => {
    const dir = `/tmp/dax-${randomUUID()}`
    const project = await getOrCreateProject("test-user", dir)
    const before = await loadPM(project.id)
    expect(before.preferences.risk).toBe("balanced")
    const updated = await savePM(project.id, {
      preferences: {
        ...before.preferences,
        risk: "conservative",
      },
    }, {
      command: "/pm set risk conservative",
    })
    expect(updated.preferences.risk).toBe("conservative")
    const reverted = await undoLastPMEvent(project.id)
    expect(reverted?.preferences.risk).toBe("balanced")
    const rows = await db
      .select()
      .from(pmEvents)
      .where(eq(pmEvents.project_id, project.id))
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  test("lists newest events first and fetches one by id", async () => {
    const dir = `/tmp/dax-${randomUUID()}`
    const project = await getOrCreateProject("test-user", dir)
    await savePM(project.id, { preferences: { risk: "conservative" } }, { command: "/pm set risk conservative" })
    await savePM(project.id, { preferences: { risk: "aggressive" } }, { command: "/pm set risk aggressive" })
    const rows = await listPMEvents(project.id, 10)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0].ts >= rows[1].ts).toBe(true)
    const row = await getPMEvent(project.id, rows[0].id)
    expect(row?.id).toBe(rows[0].id)
  })
})
