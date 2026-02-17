import { describe, expect, test } from "bun:test"
import { resolveFallbackProvider } from "./fallback.js"

describe("resolveFallbackProvider", () => {
  test("prefers codex on subscription upstream auth failure", () => {
    const next = resolveFallbackProvider(
      "chatgpt-plus",
      "OpenAI API Error: 502 - SUBSCRIPTION_UPSTREAM_AUTH_FAILED",
      { codex: true, gemini_cli: true, claude_cli: true },
    )
    expect(next?.value).toBe("chatgpt-codex")
  })

  test("falls back to gemini-cli when codex unavailable", () => {
    const next = resolveFallbackProvider(
      "chatgpt-subscription",
      "invalid subscription token",
      { codex: false, gemini_cli: true, claude_cli: true },
    )
    expect(next?.value).toBe("gemini-cli")
  })

  test("returns null when no fallback available", () => {
    const next = resolveFallbackProvider(
      "chatgpt-subscription",
      "SUBSCRIPTION_UPSTREAM_AUTH_FAILED",
      { codex: false, gemini_cli: false, claude_cli: false },
    )
    expect(next?.value).toBeNull()
  })
})
