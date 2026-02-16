import { describe, expect, test } from "bun:test"
import { renderThinkingDelta, renderThinkingPanel } from "./renderThinking.js"

describe("renderThinkingPanel", () => {
  const rows = [
    { phase: "understanding" as const, items: ["task parsed"], ts: 1 },
    { phase: "planning" as const, items: ["drafting plan"], ts: 2 },
    { phase: "execution" as const, items: ["running edit_file"], ts: 3 },
  ]

  test("minimal mode shows active and previous with compact headers", () => {
    const out = renderThinkingPanel({ phase: "execution", mode: "minimal", rows })
    expect(out.includes("▣ Planning")).toBe(true)
    expect(out.includes("▣ Execution")).toBe(true)
    expect(out.includes("Phase:")).toBe(false)
    expect(out.includes("▣ Understanding")).toBe(false)
  })

  test("verbose mode shows up to last three phases with phase labels", () => {
    const out = renderThinkingPanel({ phase: "execution", mode: "verbose", rows })
    expect(out.includes("Phase: Understanding")).toBe(true)
    expect(out.includes("Phase: Planning")).toBe(true)
    expect(out.includes("Phase: Execution")).toBe(true)
  })

  test("output is deterministic", () => {
    const a = renderThinkingPanel({ phase: "execution", mode: "verbose", rows })
    const b = renderThinkingPanel({ phase: "execution", mode: "verbose", rows })
    expect(a).toBe(b)
  })
})

describe("renderThinkingDelta", () => {
  const view = {
    phase: "analysis" as const,
    mode: "minimal" as const,
    rows: [
      { phase: "discovery" as const, items: ["src/agent"], ts: 1 },
      { phase: "analysis" as const, items: ["drafting reply"], ts: 2 },
    ],
  }

  test("is idempotent for same snapshot", () => {
    const seen = new Set<string>()
    const first = renderThinkingDelta(view, seen)
    const second = renderThinkingDelta(view, seen)
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBe(0)
  })

  test("prints only append delta", () => {
    const seen = new Set<string>()
    renderThinkingDelta(view, seen)
    const next = {
      ...view,
      rows: [
        { phase: "discovery" as const, items: ["src/agent"], ts: 1 },
        { phase: "analysis" as const, items: ["drafting reply", "stream connected"], ts: 2 },
      ],
    }
    const lines = renderThinkingDelta(next, seen)
    expect(lines).toEqual(["   • stream connected"])
  })

  test("renders minimal complete as terminal marker", () => {
    const seen = new Set<string>()
    const lines = renderThinkingDelta({
      phase: "complete",
      mode: "minimal",
      rows: [{ phase: "complete", items: ["reply ready"], ts: 3 }],
    }, seen)
    expect(lines).toEqual(["✓ Complete"])
  })

  test("re-renders after reset", () => {
    const seen = new Set<string>()
    renderThinkingDelta(view, seen)
    seen.clear()
    const lines = renderThinkingDelta(view, seen)
    expect(lines.length).toBeGreaterThan(0)
  })
})
