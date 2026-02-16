export interface ToolContext {
  workDir: string
  scope?: {
    files: string[]
    maxFiles: number
    maxLoc: number
  }
}

export interface ToolResult {
  success: boolean
  output: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface Tool {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool) {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  toLLMTools() {
    return this.list().map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }
}

export function createDefaultRegistry(): ToolRegistry {
  return new ToolRegistry()
}
