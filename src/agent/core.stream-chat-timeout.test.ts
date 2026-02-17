import { describe, expect, test } from "bun:test"
import { createAgent } from "./core.js"
import { ToolRegistry } from "../tools/types.js"
import type { LLMProvider, LLMResponse, Message } from "../llm/types.js"

class HangingChatProvider implements LLMProvider {
  name = "hanging-chat"
  completes = 0

  async complete(_messages: Message[]): Promise<LLMResponse> {
    this.completes += 1
    return { content: "fallback-complete-response" }
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

class SlowTailChatProvider implements LLMProvider {
  name = "slow-tail-chat"
  completes = 0

  async complete(_messages: Message[]): Promise<LLMResponse> {
    this.completes += 1
    return { content: "fallback-after-tail" }
  }

  stream() {
    let index = 0
    const iterator = {
      next: () => {
        if (index === 0) {
          index += 1
          return Promise.resolve({ done: false as const, value: { content: "alpha" } })
        }
        return new Promise<IteratorResult<LLMResponse>>(() => {})
      },
      return: async () => ({ done: true, value: undefined as unknown as LLMResponse }),
      [Symbol.asyncIterator]() {
        return this
      },
    }
    return iterator as unknown as AsyncGenerator<LLMResponse>
  }
}

describe("agent chatStream timeouts", () => {
  test("throws on first token timeout (outer handler should switch providers)", async () => {
    const provider = new HangingChatProvider()
    const agent = createAgent({
      name: "DAX",
      mode: "build",
      provider,
      tools: new ToolRegistry(),
      workDir: process.cwd(),
    })

    const chunks: string[] = []
    const timeouts: string[] = []
    let fallback = false
    let first = false
    const start = Date.now()

    await expect(agent.chatStream("hello", (chunk) => chunks.push(chunk), {
      firstTokenTimeoutMs: 60,
      overallTimeoutMs: 240,
      onFirstToken: () => {
        first = true
      },
      onTimeout: (kind) => {
        timeouts.push(kind)
      },
      onFallback: () => {
        fallback = true
      },
    })).rejects.toThrow()

    const elapsed = Date.now() - start
    expect(first).toBeFalse()
    expect(fallback).toBeFalse()
    expect(timeouts).toEqual(["first_token"])
    expect(provider.completes).toBe(0)
    expect(elapsed).toBeLessThan(400)
  })

  test("throws on overall timeout after first token (outer handler should switch providers)", async () => {
    const provider = new SlowTailChatProvider()
    const agent = createAgent({
      name: "DAX",
      mode: "build",
      provider,
      tools: new ToolRegistry(),
      workDir: process.cwd(),
    })

    const chunks: string[] = []
    const timeouts: string[] = []
    let fallback = false
    let first = 0
    const start = Date.now()

    await expect(agent.chatStream("hello", (chunk) => chunks.push(chunk), {
      firstTokenTimeoutMs: 120,
      overallTimeoutMs: 180,
      onFirstToken: () => {
        first += 1
      },
      onTimeout: (kind) => {
        timeouts.push(kind)
      },
      onFallback: () => {
        fallback = true
      },
    })).rejects.toThrow()

    const elapsed = Date.now() - start
    expect(first).toBe(1)
    expect(fallback).toBeFalse()
    expect(timeouts).toEqual(["overall"])
    expect(provider.completes).toBe(0)
    expect(elapsed).toBeLessThan(300)
  })
})
