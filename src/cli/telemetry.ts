import type { ExecutionPhase } from "./uiState.js"

interface BaseEvent {
  ts: number
}

export interface PhaseEnterEvent extends BaseEvent {
  type: "phase.enter"
  phase: ExecutionPhase
}

export interface PhaseStepEvent extends BaseEvent {
  type: "phase.step"
  phase: ExecutionPhase
  text: string
}

export interface ToolStartEvent extends BaseEvent {
  type: "tool.start"
  name: string
  targets: string[]
}

export interface ToolOkEvent extends BaseEvent {
  type: "tool.ok"
  name: string
}

export interface ToolFailEvent extends BaseEvent {
  type: "tool.fail"
  name: string
  error: string
}

export interface GateBlockedEvent extends BaseEvent {
  type: "gate.blocked"
  code: string
  subject: string
}

export interface GateWarnEvent extends BaseEvent {
  type: "gate.warn"
  code: string
  subject: string
}

export interface TimingEvent extends BaseEvent {
  type: "timing"
  phase: ExecutionPhase
  stage: string
  duration_ms: number
  first_token_ms?: number
}

export type TelemetryEvent =
  | PhaseEnterEvent
  | PhaseStepEvent
  | ToolStartEvent
  | ToolOkEvent
  | ToolFailEvent
  | GateBlockedEvent
  | GateWarnEvent
  | TimingEvent
