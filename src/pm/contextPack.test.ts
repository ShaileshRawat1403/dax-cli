import { describe, expect, test } from "bun:test"
import { MAX_CONTEXT_CHARS } from "./budget.js"
import { buildContextPack } from "./contextPack.js"
import type { PMState } from "./types.js"

function basePm(): PMState {
  return {
    project_id: "p1",
    charter: "charter",
    constraints: {
      never_touch: ["src/auth/**"],
      require_approval_for: ["write_file"],
    },
    preferences: {
      risk: "balanced",
      verbosity: "medium",
    },
    recent_outcomes: [],
    last_updated: new Date().toISOString(),
  }
}

describe("buildContextPack", () => {
  test("constraints always survive truncation", () => {
    const pm = basePm()
    pm.recent_outcomes = Array.from({ length: 80 }, (_, i) => ({
      ts: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
      tool: "write_file",
      success: i % 2 === 0,
      summary: `summary-${i}-${"x".repeat(220)}`,
    }))

    const text = buildContextPack({ pm, mode: "build" })
    expect(text.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
    expect(text).toContain("constraints:")
    expect(text).toContain("never_touch:src/auth/**")
    expect(text).toContain("require_approval_for:write_file")
  })

  test("truncation output is deterministic", () => {
    const pm = basePm()
    pm.recent_outcomes = Array.from({ length: 60 }, (_, i) => ({
      ts: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
      tool: "write_file",
      success: true,
      summary: `det-${i}-${"y".repeat(180)}`,
    }))

    const a = buildContextPack({ pm, mode: "build" })
    const b = buildContextPack({ pm, mode: "build" })
    expect(a).toBe(b)
  })

  test("section order remains stable", () => {
    const pm = basePm()
    pm.recent_outcomes = Array.from({ length: 6 }, (_, i) => ({
      ts: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
      tool: "write_file",
      success: true,
      summary: `order-${i}`,
    }))

    const text = buildContextPack({ pm, mode: "build" })
    const constraints = text.indexOf("constraints:")
    const prefs = text.indexOf("preferences:")
    const outcomes = text.indexOf("recent_outcomes:")
    const instructions = text.indexOf("instructions:")
    expect(prefs).toBeGreaterThanOrEqual(0)
    expect(constraints).toBeGreaterThanOrEqual(0)
    expect(prefs).toBeGreaterThan(constraints)
    expect(outcomes).toBeGreaterThan(prefs)
    expect(instructions).toBeGreaterThan(outcomes)
  })

})
