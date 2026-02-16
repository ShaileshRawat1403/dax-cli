import { describe, expect, test } from "bun:test"
import { buildThinkingView } from "./phaseController.js"
import type { TelemetryEvent } from "./telemetry.js"

describe("buildThinkingView", () => {
  test("dedupes repeated phase steps and trims to mode caps", () => {
    const events: TelemetryEvent[] = [
      { type: "phase.enter", ts: 1, phase: "analysis" },
      { type: "phase.step", ts: 2, phase: "analysis", text: "  drafting response  " },
      { type: "phase.step", ts: 3, phase: "analysis", text: "drafting response" },
      { type: "phase.step", ts: 4, phase: "analysis", text: "x".repeat(140) },
      { type: "phase.step", ts: 5, phase: "analysis", text: "s4" },
      { type: "phase.step", ts: 6, phase: "analysis", text: "s5" },
    ]
    const view = buildThinkingView(events, "minimal")
    const row = view.rows.find((item) => item.phase === "analysis")
    expect(row).toBeDefined()
    expect(row?.items[0]).toBe("drafting reply")
    expect((row?.items || []).length).toBeLessThanOrEqual(3)
  })

  test("applies deterministic phase ordering", () => {
    const events: TelemetryEvent[] = [
      { type: "phase.enter", ts: 1, phase: "verification" },
      { type: "phase.step", ts: 2, phase: "verification", text: "v" },
      { type: "phase.enter", ts: 3, phase: "planning" },
      { type: "phase.step", ts: 4, phase: "planning", text: "p" },
      { type: "phase.enter", ts: 5, phase: "understanding" },
      { type: "phase.step", ts: 6, phase: "understanding", text: "u" },
    ]
    const view = buildThinkingView(events, "verbose")
    expect(view.rows.map((row) => row.phase)).toEqual([
      "understanding",
      "planning",
      "verification",
    ])
  })

  test("supports tool and gate telemetry rows", () => {
    const events: TelemetryEvent[] = [
      { type: "phase.enter", ts: 1, phase: "execution" },
      { type: "tool.start", ts: 2, name: "edit_file", targets: ["src/a.ts"] },
      { type: "tool.ok", ts: 3, name: "edit_file" },
      { type: "gate.warn", ts: 4, code: "require_approval.path", subject: "src/a.ts" },
    ]
    const view = buildThinkingView(events, "minimal")
    const execution = view.rows.find((row) => row.phase === "execution")
    const verification = view.rows.find((row) => row.phase === "verification")
    expect(execution?.items.join(" ")).toContain("edit_file")
    expect(verification?.items.join(" ")).toContain("require_approval.path")
  })

  test("minimal mode strips scan verbs without rewriting old lines", () => {
    const events: TelemetryEvent[] = [
      { type: "phase.enter", ts: 1, phase: "discovery" },
      { type: "phase.step", ts: 2, phase: "discovery", text: "scanning src/cli" },
      { type: "phase.step", ts: 3, phase: "discovery", text: "scanning src/agent" },
    ]
    const view = buildThinkingView(events, "minimal")
    const row = view.rows.find((item) => item.phase === "discovery")
    expect(row?.items).toEqual(["src/cli", "src/agent"])
  })

  test("off mode hides rows", () => {
    const events: TelemetryEvent[] = [
      { type: "phase.enter", ts: 1, phase: "analysis" },
      { type: "phase.step", ts: 2, phase: "analysis", text: "x" },
    ]
    const view = buildThinkingView(events, "off")
    expect(view.rows.length).toBe(0)
  })
})
