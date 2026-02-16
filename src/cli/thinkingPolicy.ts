import type { ThinkingMode } from "./uiState.js"

export interface ThinkingPolicy {
  phases: number
  steps: number
  show_tools: boolean
  show_gates: boolean
  show_timing: boolean
  collapse_similar_steps: boolean
  strip_verb_prefixes: boolean
  aggregate_by_category: boolean
}

const POLICIES: Record<ThinkingMode, ThinkingPolicy> = {
  off: {
    phases: 0,
    steps: 0,
    show_tools: false,
    show_gates: false,
    show_timing: false,
    collapse_similar_steps: true,
    strip_verb_prefixes: true,
    aggregate_by_category: true,
  },
  minimal: {
    phases: 2,
    steps: 2,
    show_tools: true,
    show_gates: true,
    show_timing: false,
    collapse_similar_steps: true,
    strip_verb_prefixes: true,
    aggregate_by_category: true,
  },
  verbose: {
    phases: 3,
    steps: 6,
    show_tools: true,
    show_gates: true,
    show_timing: true,
    collapse_similar_steps: false,
    strip_verb_prefixes: false,
    aggregate_by_category: false,
  },
}

export function thinkingPolicy(mode: ThinkingMode) {
  return POLICIES[mode]
}
