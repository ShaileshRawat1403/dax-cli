export interface FallbackAvailability {
  codex: boolean
  gemini_cli: boolean
  claude_cli: boolean
}

// Helper to check if codex is available (simple heuristic)
function isCodexAvailable(): boolean {
  return process.env.CHATGPT_CODEX_MODEL !== undefined || 
         process.env.OPENAI_API_KEY !== undefined ||
         process.env.CHATGPT_SUBSCRIPTION_TOKEN !== undefined
}

export interface FallbackResult {
  type: "model" | "provider" | null
  value: string | null
  message?: string
}
export interface FallbackResult {
  type: "model" | "provider" | null
  value: string | null
  message?: string
}

const MODEL_FALLBACKS: Record<string, string[]> = {
  "gemini-cli": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  "gemini": ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  "claude-cli": ["claude-sonnet-4-5", "claude-sonnet-4-20250514", "claude-4-opus", "claude-3-opus"],
  "chatgpt-plus": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  "chatgpt-codex": ["gpt-5-codex", "gpt-4o"],
  "anthropic": ["claude-sonnet-4-20250514", "claude-4-opus-20250514", "claude-3-opus", "claude-3-sonnet"],
}

export function resolveFallbackModel(
  provider: string,
  currentModel?: string,
): string | null {
  const fallbacks = MODEL_FALLBACKS[provider]
  if (!fallbacks) return null
  
  const currentIndex = currentModel ? fallbacks.indexOf(currentModel) : -1
  const nextIndex = currentIndex + 1
  
  if (nextIndex < fallbacks.length) {
    return fallbacks[nextIndex]
  }
  return null
}

export function resolveFallbackProvider(
  provider: string,
  message: string,
  availability: FallbackAvailability,
): FallbackResult {
  const text = message.toLowerCase()
  let p = provider
  if (!p) p = ""
  
  // Quota/rate limit errors
  const quotaError = 
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("429") ||
    text.includes("429 too many requests") ||
    text.includes("resource_exhausted") ||
    text.includes("insufficient_quota") ||
    text.includes("exhausted") ||
    text.includes("capacity") ||
    text.includes("rate_limit") ||
    text.includes("terminalquotaerror") ||
    text.includes("monthly limit") ||
    text.includes("usage limit")
  
  if (quotaError) {
    console.log(`\n⚠️  Quota exceeded for ${p}`)
    return { type: "provider", value: null, message: "quota" }
  }
  
  // Connection/infrastructure errors - should fallback to other providers
  const connectionError =
    text.includes("unable to connect") ||
    text.includes("econnrefused") ||
    text.includes("connect econnrefused") ||
    text.includes("connection refused") ||
    text.includes("network error") ||
    text.includes("fetch failed") ||
    text.includes("enotfound") ||
    text.includes("timeout")
  
  if (connectionError) {
    console.log(`\n⚠️  Connection error for ${p}`)
    // Try other available providers on connection error - use switch to avoid type narrowing
    switch (p) {
      case "chatgpt-codex":
        if (availability.gemini_cli) return { type: "provider", value: "gemini-cli", message: "connection" }
        if (availability.claude_cli) return { type: "provider", value: "claude-cli", message: "connection" }
        return { type: "provider", value: "gemini", message: "connection" }
      case "gemini-cli":
        if (isCodexAvailable()) return { type: "provider", value: "chatgpt-codex", message: "connection" }
        if (availability.claude_cli) return { type: "provider", value: "claude-cli", message: "connection" }
        return { type: "provider", value: "gemini", message: "connection" }
      case "claude-cli":
        if (isCodexAvailable()) return { type: "provider", value: "chatgpt-codex", message: "connection" }
        if (availability.gemini_cli) return { type: "provider", value: "gemini-cli", message: "connection" }
        return { type: "provider", value: "gemini", message: "connection" }
      default:
        if (isCodexAvailable()) return { type: "provider", value: "chatgpt-codex", message: "connection" }
        if (availability.gemini_cli) return { type: "provider", value: "gemini-cli", message: "connection" }
        if (availability.claude_cli) return { type: "provider", value: "claude-cli", message: "connection" }
        return { type: "provider", value: null, message: "connection" }
    }
  }
  
  const subscriptionError =
    text.includes("subscription_upstream_auth_failed") ||
    text.includes("invalid subscription token") ||
    text.includes("subscription expired")
  
  if (subscriptionError) {
    switch (p) {
      case "chatgpt-plus":
      case "chatgpt-subscription":
        if (availability.codex) return { type: "provider", value: "chatgpt-codex" }
        if (availability.gemini_cli) return { type: "provider", value: "gemini-cli" }
        if (availability.claude_cli) return { type: "provider", value: "claude-cli" }
        return { type: "provider", value: null }
    }
  }
  
  const providerAuthError =
    text.includes("auth failed") ||
    text.includes("not authenticated") ||
    text.includes("unauthorized") ||
    text.includes("not logged in") ||
    text.includes("login required") ||
    text.includes("authentication")
  
  if (providerAuthError) {
    switch (p) {
      case "gemini-cli":
        if (availability.codex) return { type: "provider", value: "chatgpt-codex" }
        if (availability.claude_cli) return { type: "provider", value: "claude-cli" }
        return { type: "provider", value: null }
      case "claude-cli":
        if (availability.codex) return { type: "provider", value: "chatgpt-codex" }
        if (availability.gemini_cli) return { type: "provider", value: "gemini-cli" }
        return { type: "provider", value: null }
    }
  }
  return { type: "provider", value: null }
}
