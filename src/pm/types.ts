export type RiskPosture = "conservative" | "balanced" | "aggressive"
export type Verbosity = "low" | "medium" | "high"

export const MAX_RAO_HISTORY = 50

export type AllowRule =
  | { kind: "tool"; pattern: string }
  | { kind: "path"; pattern: string }

export type RaoSnapshot = {
  id: string
  ts: string
  kind: "run" | "audit" | "override" | "clear"
  run?: { tool: string; targets: string[]; ok: boolean }
  audit?: { blocked: boolean; warnings: { code: string; subject?: string; message: string }[] }
  override?: { event_id: string; changed_keys: string[]; command?: string }
}

export interface PMConstraints {
  never_touch?: string[]
  require_approval_for?: string[]
  always_allow?: AllowRule[]
  max_files?: number
  max_loc?: number
  require_approval_for_scope_expansion?: boolean
}

export interface PMPreferences {
  risk?: RiskPosture
  verbosity?: Verbosity
  explain_before_edit?: boolean
  plan_before_tools?: boolean
}

export interface PMOutcome {
  ts: string
  tool: string
  success: boolean
  summary: string
}

export interface PMState {
  project_id: string
  charter?: string
  constraints: PMConstraints
  preferences: PMPreferences
  recent_outcomes: PMOutcome[]
  rao?: {
    history: RaoSnapshot[]
  }
  last_updated: string
}

export function defaultPMState(project_id: string): PMState {
  return {
    project_id,
    constraints: {},
    preferences: {
      risk: "balanced",
      verbosity: "medium",
      explain_before_edit: true,
      plan_before_tools: true,
    },
    recent_outcomes: [],
    rao: {
      history: [],
    },
    last_updated: new Date().toISOString(),
  }
}
