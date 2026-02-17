import type { DaxStreamEvent, StreamState } from "../types/stream.js";

export type { DaxStreamEvent, StreamState };

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: Array<{ name: string; id: string; status: string }>;
}

export interface ToolState {
  name: string;
  id: string;
  status: "pending" | "running" | "success" | "error";
  output?: string;
  elapsed?: number;
}

export interface GateState {
  active: boolean;
  id: string;
  blocked: boolean;
  warnings: Array<{ code: string; subject: string }>;
}

export interface ContextState {
  files: string[];
  scope: string[];
}

export interface TUIBackend {
  name: "blessed" | "ratatui";
  
  dispatch(event: DaxStreamEvent): void;
  
  addUserMessage(content: string): void;
  
  setContext(context: ContextState): void;
  
  updateState(state: StreamState): void;
  
  setSendHandler(fn: (message: string) => void | Promise<void>): void;
  
  setCommandHandler(fn: (command: string) => void | Promise<void>): void;
  
  focusInput(): void;
  
  destroy(): void;
  
  onKey?(key: string, handler: () => void): void;
}

export type TUIType = "blessed" | "ratatui";

export interface TUIOptions {
  type?: TUIType;
  devMode?: boolean;
}
