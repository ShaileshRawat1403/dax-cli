export interface Message {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface Tool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export interface LLMResponse {
  content: string
  tool_calls?: ToolCall[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface LLMConfig {
  model?: string
  temperature?: number
  max_tokens?: number
  top_p?: number
}

export interface LLMProvider {
  name: string
  complete(messages: Message[], tools?: Tool[], config?: LLMConfig): Promise<LLMResponse>
  stream?(messages: Message[], tools?: Tool[], config?: LLMConfig): AsyncGenerator<LLMResponse>
}

export class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
  ) {
    super(message)
    this.name = "LLMError"
  }
}

export function createSystemPrompt(context: {
  agentName: string
  agentMode: "build" | "plan"
  scope?: {
    files: string[]
    maxFiles: number
    maxLoc: number
  }
  contract?: string
}): string {
  const basePrompt = `You are ${context.agentName}, a fast, autonomous AI coding agent.

CORE BEHAVIOR:
1. ACT, don't just plan - Execute tasks directly when possible
2. Read freely - You have full access to the entire repository
3. Be concise - Short responses, get to the point
4. Just do it - When you know what to do, do it without asking

MODE: ${context.agentMode.toUpperCase()}
${context.agentMode === "plan" ? "READ-ONLY: Analyze and explore only, no file changes." : "BUILD MODE: Read files, run commands, make changes freely."}`

  const scopePrompt = context.scope
    ? `

SCOPE (soft guideline, not hard limit):
- Focus on: ${context.scope.files.join(", ")}
- Max files to touch: ${context.scope.maxFiles}
- Stay under ~${context.scope.maxLoc} LOC changes`
    : ""

  const contractPrompt = context.contract
    ? `

REQUIRED RULES:
${context.contract}`
    : ""

  return basePrompt + scopePrompt + contractPrompt + `

QUICK START:
- When given a task, just start working on it
- If stuck, try a different approach
- Ask for clarification only when truly needed
- Keep responses brief and actionable`
}
