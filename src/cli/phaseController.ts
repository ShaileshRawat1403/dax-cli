import type { ExecutionPhase, ThinkingMode } from "./uiState.js"
import type { TelemetryEvent } from "./telemetry.js"
import { thinkingPolicy } from "./thinkingPolicy.js"

const ORDER: ExecutionPhase[] = [
  "understanding",
  "discovery",
  "analysis",
  "planning",
  "execution",
  "verification",
  "complete",
]

function trim(text: string) {
  const t = text.trim().replace(/\s+/g, " ")
  if (t.length <= 120) return t
  return `${t.slice(0, 117)}...`
}

function row(map: Map<ExecutionPhase, { items: string[] }>, phase: ExecutionPhase) {
  const hit = map.get(phase)
  if (hit) return hit
  const next = { items: [] }
  map.set(phase, next)
  return next
}

function dedupe(items: string[]) {
  return items.filter((item, i) => i === 0 || item !== items[i - 1])
}

function push(
  map: Map<ExecutionPhase, { items: string[] }>,
  phase: ExecutionPhase,
  text: string,
) {
  const t = trim(text)
  if (!t) return
  const r = row(map, phase)
  if (r.items[r.items.length - 1] === t) return
  r.items.push(t)
}

function phaseFromEvent(event: TelemetryEvent, active: ExecutionPhase): ExecutionPhase {
  if (event.type === "phase.enter" || event.type === "phase.step") return event.phase
  if (event.type === "tool.start" || event.type === "tool.ok" || event.type === "tool.fail") return "execution"
  if (event.type === "gate.warn" || event.type === "gate.blocked") return "verification"
  if (event.type === "timing") return event.phase
  return active
}

function stripVerb(step: string) {
  return step
    .replace(/^interpreting request$/i, "task parsed")
    .replace(/^building context$/i, "context loaded")
    .replace(/^scanning\s+/i, "")
    .replace(/^creating work notes$/i, "drafting plan")
    .replace(/^preflight signal received$/i, "preflight ready")
    .replace(/^drafting response$/i, "drafting reply")
    .replace(/^first token received$/i, "stream connected")
    .replace(/^response ready$/i, "reply ready")
    .replace(/^plan draft started$/i, "drafting plan")
    .replace(/^processing follow-up request$/i, "drafting reply")
    .replace(/^continuing task loop$/i, "executing steps")
}

function compressSteps(items: string[], mode: ThinkingMode) {
  if (mode !== "minimal") return items
  return dedupe(items.map((item) => stripVerb(item)))
}

export interface ThinkingViewModel {
  phase: ExecutionPhase
  mode: ThinkingMode
  rows: { phase: ExecutionPhase; items: string[]; ts: number }[]
}

export function buildThinkingView(events: TelemetryEvent[], mode: ThinkingMode): ThinkingViewModel {
  const policy = thinkingPolicy(mode)
  const map = new Map<ExecutionPhase, { items: string[] }>()
  let active: ExecutionPhase = "understanding"

  events.forEach((event) => {
    active = phaseFromEvent(event, active)
    if (event.type === "phase.step") push(map, event.phase, event.text)
    if (event.type === "tool.start" && policy.show_tools) {
      const suffix = event.targets.length > 0 ? ` ${event.targets.join(", ")}` : ""
      push(map, "execution", `running ${event.name}${suffix}`)
    }
    if (event.type === "tool.ok" && policy.show_tools) push(map, "execution", `result ok: ${event.name}`)
    if (event.type === "tool.fail" && policy.show_tools) push(map, "execution", `result failed: ${event.error}`)
    if (event.type === "gate.warn" && policy.show_gates) push(map, "verification", `[${event.code}] ${event.subject}`)
    if (event.type === "gate.blocked" && policy.show_gates) push(map, "verification", `blocked [${event.code}] ${event.subject}`)
    if (event.type === "timing" && policy.show_timing) {
      const first = event.first_token_ms === undefined ? "" : ` first_token=${event.first_token_ms}ms`
      push(map, event.phase, `timing ${event.stage}=${event.duration_ms}ms${first}`)
    }
  })

  const visible = ORDER.filter((phase) => (map.get(phase)?.items.length || 0) > 0 || phase === active)
  const phaseRows = policy.phases <= 0 ? [] : visible.slice(-policy.phases)
  const rows = phaseRows.map((phase) => {
    const base = compressSteps(dedupe(map.get(phase)?.items || []), mode)
    const clipped = base.length > policy.steps
      ? [...base.slice(0, policy.steps), `... (+${base.length - policy.steps} more)`]
      : base
    return {
      phase,
      items: mode === "off" ? [] : clipped,
      ts: 0,
    }
  })

  return { phase: active, mode, rows }
}
