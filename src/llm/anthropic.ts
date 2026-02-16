import type { LLMProvider, LLMResponse, Message, Tool, LLMConfig } from "./types.js"
import { LLMError } from "./types.js"

export class AnthropicProvider implements LLMProvider {
  name = "anthropic"
  private apiKey: string
  private baseUrl: string

  constructor(apiKey?: string, baseUrl = "https://api.anthropic.com") {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || ""
    this.baseUrl = baseUrl

    if (!this.apiKey) {
      throw new LLMError(
        "Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable.",
        "anthropic",
        "MISSING_API_KEY",
      )
    }
  }

  async complete(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): Promise<LLMResponse> {
    const systemMessage = messages.find((m) => m.role === "system")
    const conversationMessages = messages.filter((m) => m.role !== "system")

    const body: Record<string, unknown> = {
      model: config?.model || "claude-3-5-sonnet-20241022",
      max_tokens: config?.max_tokens ?? 4096,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: config?.temperature ?? 0.2,
      top_p: config?.top_p ?? 1,
    }

    if (systemMessage) {
      body.system = systemMessage.content
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }))
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new LLMError(
          error.error?.message || `HTTP ${response.status}`,
          "anthropic",
          error.error?.type || `HTTP_${response.status}`,
        )
      }

      const data = await response.json()
      const content = data.content[0]

      // Convert Anthropic tool_use to OpenAI-style tool_calls
      const toolCalls = data.content
        .filter((c: { type: string }) => c.type === "tool_use")
        .map((c: { id: string; name: string; input: unknown }) => ({
          id: c.id,
          type: "function" as const,
          function: {
            name: c.name,
            arguments: JSON.stringify(c.input),
          },
        }))

      return {
        content: content?.type === "text" ? content.text : "",
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          prompt_tokens: data.usage?.input_tokens || 0,
          completion_tokens: data.usage?.output_tokens || 0,
          total_tokens:
            (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
      }
    } catch (error) {
      if (error instanceof LLMError) throw error
      throw new LLMError(
        error instanceof Error ? error.message : "Unknown error",
        "anthropic",
        "REQUEST_FAILED",
      )
    }
  }

  async *stream(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): AsyncGenerator<LLMResponse> {
    const systemMessage = messages.find((m) => m.role === "system")
    const conversationMessages = messages.filter((m) => m.role !== "system")

    const body: Record<string, unknown> = {
      model: config?.model || "claude-3-5-sonnet-20241022",
      max_tokens: config?.max_tokens ?? 4096,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: config?.temperature ?? 0.2,
      stream: true,
    }

    if (systemMessage) {
      body.system = systemMessage.content
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }))
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new LLMError(
        error.error?.message || `HTTP ${response.status}`,
        "anthropic",
        error.error?.type || `HTTP_${response.status}`,
      )
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new LLMError("No response body", "anthropic", "NO_BODY")
    }

    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) continue

        try {
          const data = JSON.parse(trimmed.slice(6))

          if (data.type === "content_block_delta" && data.delta?.text) {
            yield {
              content: data.delta.text,
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}
