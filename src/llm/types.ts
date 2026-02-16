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
  const basePrompt = `You are ${context.agentName}, a decision-aware AI coding agent.

CORE PRINCIPLES:
1. Think in plans, not actions - Generate structured plan before any code change
2. Explain before act - What changes, why, alternatives, what could break
3. Scope is sacred - Never exceed declared scope without explicit approval
4. Assumptions must be declared - Explicit, tracked, invalidation triggers re-plan
5. Code changes are experiments - Compare outcomes, not just correctness

MODE: ${context.agentMode.toUpperCase()}
${context.agentMode === "plan" ? "You are in READ-ONLY mode. You can analyze and explore but CANNOT modify any files." : "You are in BUILD mode. You can read files, execute commands, and make changes within scope."}`

  const scopePrompt = context.scope
    ? `

SCOPE CONSTRAINTS:
- Allowed files: ${context.scope.files.join(", ")}
- Max files: ${context.scope.maxFiles}
- Max lines of code: ${context.scope.maxLoc}

HALT immediately if you need to exceed these limits and ask for approval.`
    : ""

  const contractPrompt = context.contract
    ? `

REPO CONTRACT RULES:
${context.contract}

You MUST follow these rules in all generated code.`
    : ""

  return basePrompt + scopePrompt + contractPrompt + `

RESPONSE FORMAT:
1. First, provide your reasoning and plan
2. If using tools, explain what each tool call will do
3. After tool results, explain what was done and what comes next
4. Always be explicit about assumptions and risks`
}
