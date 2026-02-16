import type { ToolCall } from "../llm/types.js"

export type SessionState =
  | "idle"
  | "planning"
  | "running"
  | "waiting_approval"
  | "error"
  | "done"

export type ExecutionPhase =
  | "understanding"
  | "discovery"
  | "analysis"
  | "planning"
  | "execution"
  | "verification"
  | "complete"

export type ThinkingMode = "minimal" | "verbose" | "off"

export interface GateView {
  blocked: boolean
  warnings: { kind: "never_touch" | "require_approval"; code: string; subject: string; message: string; matches?: string[] }[]
  toolCalls: ToolCall[]
}

export interface ToolView {
  name: string
  targets: string[]
  started_at: number
}

export interface PhaseView {
  phase: ExecutionPhase
  items: string[]
  ts: number
}

export interface UIState {
  sessionState: SessionState
  lastGate?: GateView
  lastTool?: ToolView
  thinkingMode: ThinkingMode
  phase: ExecutionPhase
  phaseSteps: PhaseView[]
  activePhaseStartedAt?: number
}

export function createUIState(): UIState {
  return {
    sessionState: "idle",
    thinkingMode: "minimal",
    phase: "understanding",
    phaseSteps: [],
  }
}

export function setState(state: UIState, next: SessionState) {
  state.sessionState = next
}

export function setGate(state: UIState, gate: GateView) {
  state.lastGate = gate
}

export function clearGate(state: UIState) {
  state.lastGate = undefined
}

export function setTool(state: UIState, tool: ToolView) {
  state.lastTool = tool
}

export function setThinkingMode(state: UIState, mode: ThinkingMode) {
  state.thinkingMode = mode
}
