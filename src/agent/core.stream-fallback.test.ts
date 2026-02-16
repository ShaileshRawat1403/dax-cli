import { describe, expect, test } from "bun:test"
import { createAgent } from "./core.js"
import { ToolRegistry } from "../tools/types.js"
import type { LLMProvider, Message, LLMResponse } from "../llm/types.js"

class FailingStreamProvider implements LLMProvider {
  name = "failing-stream"
  async complete(_messages: Message[]): Promise<LLMResponse> {
    return { content: "fallback-complete-response" }
  }
  async *stream(): AsyncGenerator<LLMResponse> {
    throw new Error("stream failed")
  }
}

describe("agent stream fallback", () => {
  test("uses complete fallback when stream throws", async () => {
    const tools = new ToolRegistry()
    const agent = createAgent({
      name: "DAX",
      mode: "build",
      provider: new FailingStreamProvider(),
      tools,
      workDir: process.cwd(),
    })
    const chunks: string[] = []
    await agent.chatStream("hi", (chunk) => chunks.push(chunk))
    expect(chunks.join("")).toContain("fallback-complete-response")
    const conversation = agent.getConversation()
    expect(conversation[conversation.length - 1]?.content).toContain("fallback-complete-response")
  })
})
