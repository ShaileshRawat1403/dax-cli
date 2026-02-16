import type { PMState, RiskPosture, Verbosity } from "./types.js"

export interface PMCommandResult {
  applied: boolean
  updates: Partial<PMState>
  confirmation?: string
}

function normalize(text: string) {
  return text.trim().toLowerCase()
}

function parseRisk(text: string): RiskPosture | null {
  if (/conservative/.test(text)) return "conservative"
  if (/aggressive/.test(text)) return "aggressive"
  if (/balanced/.test(text)) return "balanced"
  return null
}

function parseVerbosity(text: string): Verbosity | null {
  if (/verbose|more detail|high verbosity/.test(text)) return "high"
  if (/concise|short|brief|low verbosity/.test(text)) return "low"
  if (/medium verbosity|normal verbosity/.test(text)) return "medium"
  return null
}

export function applyPMCommands(text: string, pm: PMState): PMCommandResult {
  const t = normalize(text)
  const risk = parseRisk(t)
  if (/mode|risk|posture/.test(t) && risk) {
    return {
      applied: true,
      updates: { preferences: { ...pm.preferences, risk } },
      confirmation: `Updated risk posture to '${risk}'.`,
    }
  }

  const verbosity = parseVerbosity(t)
  if (verbosity) {
    return {
      applied: true,
      updates: { preferences: { ...pm.preferences, verbosity } },
      confirmation: `Updated verbosity to '${verbosity}'.`,
    }
  }

  const neverTouch = t.match(/never touch\s+([a-z0-9_./*-]+)/i)
  if (neverTouch?.[1]) {
    const next = Array.from(new Set([...(pm.constraints.never_touch || []), neverTouch[1]]))
    return {
      applied: true,
      updates: { constraints: { ...pm.constraints, never_touch: next } },
      confirmation: `Added never-touch constraint '${neverTouch[1]}'.`,
    }
  }

  if (/plan before tools|always plan first/.test(t)) {
    return {
      applied: true,
      updates: { preferences: { ...pm.preferences, plan_before_tools: true } },
      confirmation: "Enabled 'plan before tools'.",
    }
  }

  if (/explain before edit|always explain edits/.test(t)) {
    return {
      applied: true,
      updates: { preferences: { ...pm.preferences, explain_before_edit: true } },
      confirmation: "Enabled 'explain before edit'.",
    }
  }

  return { applied: false, updates: {} }
}
