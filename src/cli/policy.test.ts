import { describe, expect, test } from "bun:test"
import { isPolicyName, policyConfig } from "./policy.js"

describe("policy", () => {
  test("validates policy names", () => {
    expect(isPolicyName("safe")).toBe(true)
    expect(isPolicyName("balanced")).toBe(true)
    expect(isPolicyName("aggressive")).toBe(true)
    expect(isPolicyName("random")).toBe(false)
  })

  test("builds safe policy config", () => {
    const cfg = policyConfig("safe", "gpt-4o")
    expect(cfg.model).toBe("gpt-4o")
    expect(cfg.temperature).toBe(0.1)
    expect(cfg.max_tokens).toBe(2048)
  })
})
