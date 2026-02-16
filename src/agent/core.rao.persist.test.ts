import { randomUUID } from "crypto"
import { describe, expect, test } from "bun:test"
import { createAgent } from "./core.js"
import { ToolRegistry } from "../tools/types.js"
import type { LLMProvider, LLMResponse, Message, ToolCall } from "../llm/types.js"

class Provider implements LLMProvider {
  name = "rao-provider"
  private call: ToolCall

  constructor(path: string) {
    this.call = {
      id: "t1",
      type: "function",
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path }),
      },
    }
  }

  async complete(_messages: Message[]): Promise<LLMResponse> {
    return { content: "run", tool_calls: [this.call] }
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
  pmState: {
    constraints: {
      never_touch?: string[]
      require_approval_for?: string[]
    }
    rao?: {
      history: Array<{
        id: string
        ts: string
        kind: "audit"
        audit: {
          blocked: boolean
          warnings: Array<{ code: string; subject?: string; message: string }>
        }
      }>
    }
  }
}

describe("rao persistence", () => {
  test("persists run/audit/override snapshots, dedups audit, and replays after restart", async () => {
    const workDir = `/tmp/dax-rao-${randomUUID()}`
    const tools = new ToolRegistry()
    tools.register({
      name: "write_file",
      description: "write file",
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        return { success: true, output: "ok" }
      },
    })

    const blocked = createAgent({
      name: "DAX",
      mode: "build",
      provider: new Provider("secrets/key.txt"),
      tools,
      workDir,
      requireApproval: true,
    })
    blocked.setWorkNotes(notes())
    await blocked.listPMHistory(1)
    ;(blocked as unknown as Internal).pmState.constraints.never_touch = ["secrets/**"]
    await blocked.continue()
    await blocked.continue()

    const blockedHistory = await blocked.getRaoHistory(20)
    const blockedAudits = blockedHistory.filter((row) => row.kind === "audit" && row.audit?.blocked)
    expect(blockedAudits.length).toBe(1)

    const run = createAgent({
      name: "DAX",
      mode: "build",
      provider: new Provider("src/a.ts"),
      tools,
      workDir,
      requireApproval: true,
    })
    run.setWorkNotes(notes())
    await run.listPMHistory(1)
    ;(run as unknown as Internal).pmState.constraints.require_approval_for = ["write_file", "src/**"]
    ;(run as unknown as Internal).pmState.rao = {
      history: [{
        id: "seed-audit",
        ts: new Date().toISOString(),
        kind: "audit",
        audit: {
          blocked: false,
          warnings: [
            { code: "require_approval.tool", subject: "write_file", message: "Tool 'write_file' matches tool approval policy." },
            { code: "require_approval.path", subject: "src/** -> src/a.ts", message: "Tool 'write_file' matches path approval policy." },
          ],
        },
      }],
    }

    await run.continue()
    await run.alwaysAllowFromPending("tool")
    await run.undoPM()

    const history = await run.getRaoHistory(30)
    const audits = history.filter((row) => row.kind === "audit")
    expect(audits.length).toBe(1)
    expect(history.some((row) => row.kind === "run" && row.run?.ok)).toBe(true)
    expect(history.some((row) => row.kind === "override" && (row.override?.changed_keys.length || 0) > 0)).toBe(true)

    const purged = await run.purgeRaoHistory()
    expect(purged).toBe(true)
    const afterPurge = await run.getRaoHistory(30)
    expect(afterPurge.length).toBe(0)
    const events = await run.listPMHistory(5)
    expect(events.some((row) => row.event_type === "rao_purge")).toBe(true)

    const replay = createAgent({
      name: "DAX",
      mode: "build",
      provider: new Provider("src/b.ts"),
      tools,
      workDir,
      requireApproval: true,
    })
    const replayed = await replay.getRaoHistory(20)
    expect(replayed.length).toBe(0)
  })
})
