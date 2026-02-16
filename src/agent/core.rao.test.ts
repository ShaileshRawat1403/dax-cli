import { describe, expect, test } from "bun:test"
import { createAgent } from "./core.js"
import { ToolRegistry } from "../tools/types.js"
import type { LLMProvider, LLMResponse, Message, ToolCall } from "../llm/types.js"

class GateProvider implements LLMProvider {
  name = "gate-provider"
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
    return {
      content: "run",
      tool_calls: [this.call],
    }
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

type InternalAgent = {
  pmState: {
    constraints: {
      never_touch?: string[]
      require_approval_for?: string[]
    }
  }
}

describe("agent rao state", () => {
  test("tracks blocked audit, run status, and override updates", async () => {
    const tools = new ToolRegistry()
    tools.register({
      name: "write_file",
      description: "write file",
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        return { success: true, output: "ok" }
      },
    })

    const blockedAgent = createAgent({
      name: "DAX",
      mode: "build",
      provider: new GateProvider("secrets/key.txt"),
      tools,
      workDir: process.cwd(),
      requireApproval: true,
    })
    blockedAgent.setWorkNotes(notes())
    await blockedAgent.listPMHistory(1)
    ;(blockedAgent as unknown as InternalAgent).pmState.constraints.never_touch = ["secrets/**"]

    await blockedAgent.continue()
    const blocked = blockedAgent.getRaoStatus()
    expect(blocked.run).toBeNull()
    expect(blocked.audit.gate).toBe("blocked")

    const runAgent = createAgent({
      name: "DAX",
      mode: "build",
      provider: new GateProvider("src/a.ts"),
      tools,
      workDir: process.cwd(),
      requireApproval: true,
    })
    runAgent.setWorkNotes(notes())
    await runAgent.listPMHistory(1)
    ;(runAgent as unknown as InternalAgent).pmState.constraints.require_approval_for = ["write_file"]

    await runAgent.continue()
    const pending = runAgent.getPendingGate()
    expect(pending?.blocked).toBe(false)
    const approved = await runAgent.alwaysAllowFromPending("tool")
    expect(approved).toBe(true)

    const ran = runAgent.getRaoStatus()
    expect(ran.run?.result).toBe("ok")
    expect(ran.audit.gate).not.toBe("blocked")

    const beforeUndo = runAgent.getRaoStatus().override
    const undone = await runAgent.undoPM()
    expect(undone).toBe(true)
    const afterUndo = runAgent.getRaoStatus().override
    expect(afterUndo?.id).toBeTruthy()
    expect(afterUndo?.id).not.toBe(beforeUndo?.id)
    expect((afterUndo?.changed_keys || []).length).toBeGreaterThan(0)

    runAgent.clearRaoStatus()
    const cleared = runAgent.getRaoStatus()
    expect(cleared.run).toBeNull()
    expect(cleared.audit.gate).toBe("clean")
    expect(cleared.override).toBeNull()
  })
})
