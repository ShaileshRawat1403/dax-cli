export interface FallbackAvailability {
  codex: boolean
  gemini_cli: boolean
  claude_cli: boolean
}

export function resolveFallbackProvider(
  provider: string,
  message: string,
  availability: FallbackAvailability,
): string | null {
  const text = message.toLowerCase()
  const subscriptionError =
    text.includes("subscription_upstream_auth_failed") ||
    text.includes("invalid subscription token")
  if ((provider === "chatgpt-plus" || provider === "chatgpt-subscription") && subscriptionError) {
    if (availability.codex) return "chatgpt-codex"
    if (availability.gemini_cli) return "gemini-cli"
    if (availability.claude_cli) return "claude-cli"
    return null
  }
  const providerAuthError =
    text.includes("auth failed") ||
    text.includes("not authenticated") ||
    text.includes("unauthorized")
  if ((provider === "gemini-cli" || provider === "claude-cli") && providerAuthError) {
    if (availability.codex) return "chatgpt-codex"
    return null
  }
  return null
}
