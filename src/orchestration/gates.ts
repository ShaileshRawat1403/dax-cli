import type { ToolCall } from "../llm/types.js"
import type { AllowRule, PMState } from "../pm/types.js"

export type GateWarningKind = "never_touch" | "require_approval"

export type GateWarningCode =
  | "never_touch.path"
  | "require_approval.path"
  | "require_approval.tool"

export interface GateWarning {
  kind: GateWarningKind
  code: GateWarningCode
  subject: string
  message: string
  matches?: string[]
}

export interface GateResult {
  needs_approval: boolean
  blocked: boolean
  warnings: GateWarning[]
}

function filesFromArgs(args: Record<string, unknown>) {
  const keys = ["path", "file", "target", "baseline_file", "proposed_file", "files"]
  return keys
    .map((k) => args[k])
    .flatMap((value) => {
      if (!value) return []
      if (typeof value === "string") return [value]
      if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
      return []
    })
}

function matchesPattern(file: string, pattern: string) {
  if (!pattern.includes("*")) return file.includes(pattern)
  const regex = new RegExp(pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"))
  return regex.test(file)
}

function isAllowedByTool(tool: string, rules: AllowRule[]) {
  return rules
    .filter((rule) => rule.kind === "tool")
    .some((rule) => matchesPattern(tool, rule.pattern))
}

function isAllowedByPath(files: string[], rules: AllowRule[]) {
  if (files.length === 0) return false
  const pathRules = rules.filter((rule) => rule.kind === "path")
  if (pathRules.length === 0) return false
  return files.every((file) => pathRules.some((rule) => matchesPattern(file, rule.pattern)))
}

export function evaluateGates(toolCalls: ToolCall[] | undefined, pm: PMState): GateResult {
  if (!toolCalls || toolCalls.length === 0) return { needs_approval: false, blocked: false, warnings: [] }
  const warnings: GateWarning[] = []
  const neverTouch = pm.constraints.never_touch || []
  const alwaysAllow = pm.constraints.always_allow || []
  const approvalPatterns = pm.constraints.require_approval_for || []
  let blocked = false

  for (const call of toolCalls) {
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(call.function.arguments || "{}")
    } catch {
      parsed = {}
    }

    const files = filesFromArgs(parsed)

    const restricted = files.filter((file) => neverTouch.some((pattern) => matchesPattern(file, pattern)))
    if (restricted.length > 0) {
      const matched = restricted.flatMap((file) =>
        neverTouch
          .filter((pattern) => matchesPattern(file, pattern))
          .map((pattern) => `${pattern} -> ${file}`),
      )
      warnings.push({
        kind: "never_touch",
        code: "never_touch.path",
        subject: matched[0] || restricted[0] || call.function.name,
        message: `Tool '${call.function.name}' targets restricted paths: ${restricted.join(", ")}`,
        matches: matched.length > 0 ? matched : restricted,
      })
      blocked = true
      continue
    }

    if (isAllowedByTool(call.function.name, alwaysAllow) || isAllowedByPath(files, alwaysAllow)) {
      continue
    }

    const pathMatches = files.flatMap((file) =>
      approvalPatterns
        .filter((pattern) => matchesPattern(file, pattern))
        .map((pattern) => `${pattern} -> ${file}`),
    )
    if (pathMatches.length > 0) {
      warnings.push({
        kind: "require_approval",
        code: "require_approval.path",
        subject: pathMatches[0],
        message: `Tool '${call.function.name}' matches path approval policy.`,
        matches: pathMatches,
      })
    }

    const toolMatches = approvalPatterns.filter((pattern) => call.function.name.includes(pattern))
    if (toolMatches.length > 0) {
      warnings.push({
        kind: "require_approval",
        code: "require_approval.tool",
        subject: toolMatches[0],
        message: `Tool '${call.function.name}' matches tool approval policy.`,
        matches: toolMatches,
      })
    }
  }

  return {
    needs_approval: warnings.length > 0,
    blocked,
    warnings,
  }
}
