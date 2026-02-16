import { describe, expect, test } from "bun:test"
import { createAgent } from "./core.js"
import { ToolRegistry } from "../tools/types.js"
import type { LLMProvider, LLMResponse, Message } from "../llm/types.js"

class HangingPlanningProvider implements LLMProvider {
  name = "hanging-planning"
  async complete(_messages: Message[]): Promise<LLMResponse> {
    return { content: "ok" }
  }
  stream() {
    const iterator = {
      next: () => new Promise<IteratorResult<LLMResponse>>(() => {}),
      return: async () => ({ done: true, value: undefined as unknown as LLMResponse }),
      [Symbol.asyncIterator]() {
        return this
      },
    }
    return iterator as unknown as AsyncGenerator<LLMResponse>
  }
}

describe("streamPlanningThought timeout", () => {
  test("returns quickly when first token timeout is hit", async () => {
    const agent = createAgent({
      name: "DAX",
      mode: "build",
      provider: new HangingPlanningProvider(),
      tools: new ToolRegistry(),
      workDir: process.cwd(),
    })

    const chunks: string[] = []
    const start = Date.now()
    await agent.streamPlanningThought(
      "plan this",
      (chunk) => chunks.push(chunk),
      { firstTokenTimeoutMs: 80, overallTimeoutMs: 200 },
    )
    const elapsed = Date.now() - start

    expect(chunks.length).toBe(0)
    expect(elapsed).toBeLessThan(500)
  })
})
