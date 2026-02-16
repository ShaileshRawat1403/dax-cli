import { describe, expect, test } from "bun:test"
import { createTelemetryBus } from "./telemetryBus.js"

describe("telemetryBus", () => {
  test("keeps bounded ring buffer and notifies subscribers", () => {
    const bus = createTelemetryBus(2)
    const seen: string[] = []
    bus.subscribe((event, all) => {
      seen.push(event.type + ":" + all.length)
    })
    bus.emit({ type: "phase.enter", ts: 1, phase: "understanding" })
    bus.emit({ type: "phase.step", ts: 2, phase: "understanding", text: "a" })
    bus.emit({ type: "phase.step", ts: 3, phase: "analysis", text: "b" })
    expect(bus.list().length).toBe(2)
    expect(bus.list()[0]?.type).toBe("phase.step")
    expect(seen).toEqual(["phase.enter:1", "phase.step:2", "phase.step:2"])
  })
})
