import type { WorkNotes } from "../agent/core.js"
import { getScopeStatus } from "../tools/validation.js"
import { MAX_CONTEXT_CHARS, MAX_OUTCOMES } from "./budget.js"
import type { PMState } from "./types.js"

function short(text: string, max = 280) {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…(truncated)`
}

function joinLines(lines: string[]) {
  return lines.filter(Boolean).join("\n")
}

function fit(head: string[], rows: string[], tail: string[]) {
  const keep = [...rows]
  while (true) {
    const text = joinLines([...head, ...keep, ...tail])
    if (text.length <= MAX_CONTEXT_CHARS) return text
    if (keep.length === 0) return joinLines([...head, ...tail])
    keep.shift()
  }
}

export function buildContextPack(input: {
  pm: PMState
  mode: "build" | "plan"
  notes?: WorkNotes
}) {
  const scope = getScopeStatus() || "Scope tracker not initialized."
  const constraints = [
    ...(input.pm.constraints.never_touch || []).map((p) => `never_touch:${p}`),
    ...(input.pm.constraints.require_approval_for || []).map((p) => `require_approval_for:${p}`),
    ...(input.pm.constraints.always_allow || []).map((rule) => `always_allow_${rule.kind}:${rule.pattern}`),
    input.pm.constraints.max_files ? `max_files:${input.pm.constraints.max_files}` : "",
    input.pm.constraints.max_loc ? `max_loc:${input.pm.constraints.max_loc}` : "",
    input.pm.constraints.require_approval_for_scope_expansion ? "require_scope_approval:true" : "",
  ].filter(Boolean)

  const plan = input.notes?.plan.steps.slice(0, 8).map((s, i) => `${i + 1}. ${s}`) || []
  const outcomes = input.pm.recent_outcomes
    .slice(-MAX_OUTCOMES)
    .map((o) => `${o.ts} ${o.tool} ${o.success ? "ok" : "err"} ${short(o.summary, 100)}`)

  const head = [
    "RAO PROJECT PM CONTEXT",
    `project_id: ${input.pm.project_id}`,
    `mode: ${input.mode}`,
    input.pm.charter ? `charter: ${short(input.pm.charter, 400)}` : "",
    `constraints: ${constraints.length > 0 ? constraints.join(", ") : "none"}`,
    `preferences: risk=${input.pm.preferences.risk || "balanced"}, verbosity=${input.pm.preferences.verbosity || "medium"}, explain_before_edit=${String(input.pm.preferences.explain_before_edit ?? true)}, plan_before_tools=${String(input.pm.preferences.plan_before_tools ?? true)}`,
    `scope_status: ${short(scope, 420)}`,
    plan.length > 0 ? `active_plan: ${plan.join(" | ")}` : "",
  ]

  const tail = [
    "instructions: obey constraints, summarize risks before edits, request approval when risky, keep responses concise and actionable.",
  ]

  const rows = outcomes.length > 0
    ? outcomes.map((row) => `- ${row}`)
    : ["- none"]

  return fit([
    ...head,
    "recent_outcomes:",
  ], rows, tail)
}
