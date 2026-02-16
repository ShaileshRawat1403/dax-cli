import type { ExecutionPhase, ThinkingMode } from "./uiState.js"

const ORDER: ExecutionPhase[] = [
  "understanding",
  "discovery",
  "analysis",
  "planning",
  "execution",
  "verification",
  "complete",
]

const TITLES: Record<ExecutionPhase, string> = {
  understanding: "Understanding",
  discovery: "Discovery",
  analysis: "Analysis",
  planning: "Planning",
  execution: "Execution",
  verification: "Verification",
  complete: "Complete",
}

export interface ThinkingSnapshot {
  phase: ExecutionPhase
  mode: ThinkingMode
  rows: { phase: ExecutionPhase; items: string[]; ts: number }[]
}

function visible(snapshot: ThinkingSnapshot) {
  const rows = snapshot.rows
    .filter((row) => row.items.length > 0 || row.phase === snapshot.phase)
    .sort((a, b) => ORDER.indexOf(a.phase) - ORDER.indexOf(b.phase))
  if (snapshot.mode === "verbose") return rows.slice(-3)
  if (snapshot.mode === "off") return []
  const i = rows.findIndex((row) => row.phase === snapshot.phase)
  if (i < 0) return rows.slice(-2)
  return rows.slice(Math.max(0, i - 1), i + 1)
}

function head(mode: ThinkingMode, phase: ExecutionPhase) {
  return mode === "minimal"
    ? `▣ ${TITLES[phase]}`
    : `▣ Phase: ${TITLES[phase]}`
}

export function renderThinkingPanel(snapshot: ThinkingSnapshot) {
  const rows = visible(snapshot)
  if (rows.length === 0) return ""
  return rows
    .map((row) => {
      const title = head(snapshot.mode, row.phase)
      if (row.items.length === 0) return title
      return [title, ...row.items.map((item) => `   • ${item}`)].join("\n")
    })
    .join("\n\n")
}

export function renderThinkingDelta(snapshot: ThinkingSnapshot, rendered: Set<string>) {
  if (snapshot.mode === "off") return [] as string[]
  const lines: string[] = []
  visible(snapshot).forEach((row) => {
    const hk = `phase:${row.phase}`
    if (snapshot.mode === "minimal" && row.phase === "complete") {
      const done = "complete:marker"
      if (!rendered.has(done)) {
        lines.push("✓ Complete")
        rendered.add(done)
      }
      rendered.add(hk)
      return
    }
    if (!rendered.has(hk)) {
      lines.push(head(snapshot.mode, row.phase))
      rendered.add(hk)
    }
    row.items.forEach((item) => {
      const sk = `step:${row.phase}:${item}`
      if (rendered.has(sk)) return
      lines.push(`   • ${item}`)
      rendered.add(sk)
    })
  })
  return lines
}
