import { describe, expect, test } from "bun:test"
import { evaluateGates } from "./gates.js"
import type { ToolCall } from "../llm/types.js"
import type { PMState } from "../pm/types.js"

function pm(): PMState {
  return {
    project_id: "p1",
    constraints: {},
    preferences: {},
    recent_outcomes: [],
    last_updated: new Date().toISOString(),
  }
}

function call(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: "t1",
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}

describe("evaluateGates", () => {
  test("requires approval for configured tool policy", () => {
    const state = pm()
    state.constraints.require_approval_for = ["write_file"]
    const gate = evaluateGates([call("write_file", { path: "src/a.ts" })], state)
    expect(gate.needs_approval).toBe(true)
    expect(gate.blocked).toBe(false)
    expect(gate.warnings[0]?.kind).toBe("require_approval")
    expect(gate.warnings[0]?.code).toBe("require_approval.tool")
  })

  test("skips approval when always_allow matches tool", () => {
    const state = pm()
    state.constraints.require_approval_for = ["write_file"]
    state.constraints.always_allow = [{ kind: "tool", pattern: "write_file" }]
    const gate = evaluateGates([call("write_file", { path: "src/a.ts" })], state)
    expect(gate.needs_approval).toBe(false)
  })

  test("skips approval when all files match always_allow path rule", () => {
    const state = pm()
    state.constraints.require_approval_for = ["src/auth/**"]
    state.constraints.always_allow = [{ kind: "path", pattern: "src/auth/**" }]
    const gate = evaluateGates([call("write_file", { files: ["src/auth/a.ts", "src/auth/b.ts"] })], state)
    expect(gate.needs_approval).toBe(false)
  })

  test("keeps approval when only some files match path allow rule", () => {
    const state = pm()
    state.constraints.require_approval_for = ["src/**"]
    state.constraints.always_allow = [{ kind: "path", pattern: "src/auth/**" }]
    const gate = evaluateGates([call("write_file", { files: ["src/auth/a.ts", "src/core/x.ts"] })], state)
    expect(gate.needs_approval).toBe(true)
    expect(gate.warnings.some((row) => row.code === "require_approval.path")).toBe(true)
  })

  test("never_touch wins over always_allow path", () => {
    const state = pm()
    state.constraints.never_touch = ["secrets/**"]
    state.constraints.always_allow = [{ kind: "path", pattern: "secrets/**" }]
    const gate = evaluateGates([call("write_file", { path: "secrets/key.txt" })], state)
    expect(gate.needs_approval).toBe(true)
    expect(gate.blocked).toBe(true)
    expect(gate.warnings.some((row) => row.code === "never_touch.path")).toBe(true)
    expect(gate.warnings.map((row) => row.message).join("\n")).toMatch(/restricted paths/i)
  })

  test("never_touch wins over always_allow tool", () => {
    const state = pm()
    state.constraints.never_touch = ["secrets/**"]
    state.constraints.always_allow = [{ kind: "tool", pattern: "write_file" }]
    const gate = evaluateGates([call("write_file", { path: "secrets/key.txt" })], state)
    expect(gate.needs_approval).toBe(true)
    expect(gate.blocked).toBe(true)
    expect(gate.warnings.some((row) => row.code === "never_touch.path")).toBe(true)
    expect(gate.warnings.map((row) => row.message).join("\n")).toMatch(/restricted paths/i)
  })
})
