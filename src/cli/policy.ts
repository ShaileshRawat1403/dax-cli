import type { LLMConfig } from "../llm/types.js"

export type PolicyName = "safe" | "balanced" | "aggressive"

export function isPolicyName(value: string): value is PolicyName {
  return value === "safe" || value === "balanced" || value === "aggressive"
}

export function policyConfig(policy: PolicyName, model?: string): LLMConfig {
  if (policy === "safe") {
    return {
      model,
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: 2048,
    }
  }
  if (policy === "aggressive") {
    return {
      model,
      temperature: 0.45,
      top_p: 1,
      max_tokens: 8192,
    }
  }
  return {
    model,
    temperature: 0.2,
    top_p: 0.95,
    max_tokens: 4096,
  }
}
