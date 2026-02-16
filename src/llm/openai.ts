import type { LLMProvider, LLMResponse, Message, Tool, LLMConfig } from "./types.js"
import { LLMError } from "./types.js"

export class OpenAIProvider implements LLMProvider {
  name = "openai"
  private apiKey: string
  private baseUrl: string

  constructor(apiKey?: string, baseUrl = "https://api.openai.com/v1") {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || ""
    this.baseUrl = baseUrl

    if (!this.apiKey) {
      throw new LLMError(
        "OpenAI API key not found. Set OPENAI_API_KEY environment variable.",
        "openai",
        "MISSING_API_KEY",
      )
    }
  }

  async complete(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: config?.model || "gpt-4o",
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
      })),
      temperature: config?.temperature ?? 0.2,
      max_tokens: config?.max_tokens ?? 4096,
      top_p: config?.top_p ?? 1,
    }

    if (tools && tools.length > 0) {
      body.tools = tools
      body.tool_choice = "auto"
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new LLMError(
          error.error?.message || `HTTP ${response.status}`,
          "openai",
          error.error?.code || `HTTP_${response.status}`,
        )
      }

      const data = await response.json()
      const choice = data.choices[0]

      return {
        content: choice.message.content || "",
        tool_calls: choice.message.tool_calls,
        usage: data.usage,
      }
    } catch (error) {
      if (error instanceof LLMError) throw error
      throw new LLMError(
        error instanceof Error ? error.message : "Unknown error",
        "openai",
        "REQUEST_FAILED",
      )
    }
  }

  async *stream(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): AsyncGenerator<LLMResponse> {
    const body: Record<string, unknown> = {
      model: config?.model || "gpt-4o",
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: config?.temperature ?? 0.2,
      max_tokens: config?.max_tokens ?? 4096,
      top_p: config?.top_p ?? 1,
      stream: true,
    }

    if (tools && tools.length > 0) {
      body.tools = tools
      body.tool_choice = "auto"
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new LLMError(
        error.error?.message || `HTTP ${response.status}`,
        "openai",
        error.error?.code || `HTTP_${response.status}`,
      )
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new LLMError("No response body", "openai", "NO_BODY")
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
        if (!trimmed || trimmed === "data: [DONE]") continue

        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.slice(6))
            const delta = data.choices[0]?.delta

            if (delta?.content || delta?.tool_calls) {
              yield {
                content: delta.content || "",
                tool_calls: delta.tool_calls,
              }
            }
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    }
  }
}
