import type { TelemetryEvent } from "./telemetry.js"

export function createTelemetryBus(max = 300) {
  const events: TelemetryEvent[] = []
  const handlers = new Set<(event: TelemetryEvent, all: TelemetryEvent[]) => void>()
  return {
    emit(event: TelemetryEvent) {
      events.push(event)
      if (events.length > max) events.shift()
      handlers.forEach((handler) => handler(event, [...events]))
    },
    subscribe(handler: (event: TelemetryEvent, all: TelemetryEvent[]) => void) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    list() {
      return [...events]
    },
    clear() {
      events.length = 0
    },
  }
}
