export type StreamState =
  | "request_sent"
  | "awaiting_first_token"
  | "streaming"
  | "tool_executing"
  | "done"
  | "error";

export interface DaxStreamEvent {
  type:
    | "meta"
    | "state"
    | "text_delta"
    | "tool_call"
    | "tool_result"
    | "tool_start"
    | "tool_ok"
    | "tool_fail"
    | "gate"
    | "gate_resolved"
    | "error"
    | "complete";
  timestamp: number;
  data: DaxStreamData;
}

export interface DaxStreamData {
  provider?: string;
  model?: string;
  session?: string;
  state?: StreamState;
  text?: string;
  tool?: {
    name: string;
    id: string;
    arguments?: string;
  };
  result?: {
    tool_id: string;
    success: boolean;
    output?: string;
    error?: string;
    elapsed_ms?: number;
  };
  gate?: {
    id: string;
    blocked: boolean;
    warnings: Array<{ code: string; subject: string }>;
    pending: boolean;
  };
  resolution?: {
    action: "approve_once" | "always_allow_tool" | "always_allow_path" | "reject";
    pattern?: string;
  };
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  phase?: string;
  step?: string;
}

export function createEvent(
  type: DaxStreamEvent["type"],
  data: DaxStreamData
): DaxStreamEvent {
  return {
    type,
    timestamp: Date.now(),
    data,
  };
}

export function createMetaEvent(provider: string, model: string): DaxStreamEvent {
  return createEvent("meta", { provider, model });
}

export function createStateEvent(state: StreamState): DaxStreamEvent {
  return createEvent("state", { state });
}

export function createTextDeltaEvent(text: string): DaxStreamEvent {
  return createEvent("text_delta", { text });
}

export function createToolCallEvent(
  name: string,
  id: string,
  arguments_?: string
): DaxStreamEvent {
  return createEvent("tool_call", {
    tool: { name, id, arguments: arguments_ },
  });
}

export function createToolResultEvent(
  toolId: string,
  success: boolean,
  output?: string,
  error?: string,
  elapsedMs?: number
): DaxStreamEvent {
  return createEvent("tool_result", {
    result: {
      tool_id: toolId,
      success,
      output,
      error,
      elapsed_ms: elapsedMs,
    },
  });
}

export function createGateEvent(gate: DaxStreamData["gate"]): DaxStreamEvent {
  return createEvent("gate", { gate });
}

export function createErrorEvent(
  code: string,
  message: string,
  recoverable = false
): DaxStreamEvent {
  return createEvent("error", {
    error: { code, message, recoverable },
  });
}

export function createCompleteEvent(): DaxStreamEvent {
  return createEvent("complete", {});
}
