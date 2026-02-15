import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { createAgent } from "./core.js"
import { ToolRegistry } from "../tools/types.js"
import type { LLMProvider, LLMResponse, Message, ToolCall } from "../llm/types.js"
import { db } from "../db/index.js"
import { pmEvents } from "../db/schema.js"
import { cleanupTestDb, bootTestDb } from "../test/dbHarness.js"
import { getPmWriteCount, loadPM, resetPmWriteCountForTests } from "../pm/store.js"

class Provider implements LLMProvider {
  name = "simulate-readonly-provider"
  private sent = false

  async complete(_messages: Message[]): Promise<LLMResponse> {
    if (this.sent) return { content: "done" }
    this.sent = true
    const call: ToolCall = {
      id: "t1",
      type: "function",
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "src/a.ts" }),
      },
    }
    return { content: "run", tool_calls: [call] }
  }
}

function notes() {
  return {
    intent: { what: "x", why: "y" },
    hypothesis: { expected: "z", metrics: [] },
    plan: { steps: ["a"], alternatives: [], rationale: "r" },
    scope: { files: ["src/**"], max_files: 10, max_loc: 1000 },
    assumptions: [],
    risks: { technical: [], behavioral: [] },
    status: "active",
  }
}

type Internal = {
  projectId?: string
}

describe("rao simulate readonly", () => {
  let path = ""

  beforeAll(async () => {
    path = await bootTestDb("rao-sim-readonly")
  })

  afterAll(async () => {
    await cleanupTestDb(path)
  })

  test("simulation does not mutate pm state or write pm events", async () => {
    const tools = new ToolRegistry()
    tools.register({
      name: "write_file",
      description: "write file",
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        return { success: true, output: "ok" }
      },
    })

    const agent = createAgent({
      name: "DAX",
      mode: "build",
      provider: new Provider(),
      tools,
      workDir: "/tmp/dax-rao-sim-readonly",
      requireApproval: true,
    })

    agent.setWorkNotes(notes())
    await agent.continue()

    const projectId = (agent as unknown as Internal).projectId
    expect(projectId).toBeTruthy()
    if (!projectId) return

    const pmBefore = await loadPM(projectId)
    const eventsBeforeRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(pmEvents)
      .where(eq(pmEvents.project_id, projectId))
    const eventsBefore = Number(eventsBeforeRows[0]?.count || 0)

    resetPmWriteCountForTests()
    const simulated = await agent.simulateRaoReplay(10)
    const writesAfter = getPmWriteCount()

    const pmAfter = await loadPM(projectId)
    const eventsAfterRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(pmEvents)
      .where(eq(pmEvents.project_id, projectId))
    const eventsAfter = Number(eventsAfterRows[0]?.count || 0)

    expect(simulated.length).toBeGreaterThan(0)
    expect(simulated.some((row) => row.simulate?.available)).toBe(true)
    expect(JSON.stringify(pmAfter)).toBe(JSON.stringify(pmBefore))
    expect(eventsAfter).toBe(eventsBefore)
    expect(writesAfter).toBe(0)
  })
})
