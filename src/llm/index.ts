export * from "./types.js"
export { OpenAIProvider } from "./openai.js"
export { AnthropicProvider } from "./anthropic.js"
export { OllamaProvider, createOllamaProvider } from "./ollama.js"

import type { LLMProvider } from "./types.js"
import { OpenAIProvider } from "./openai.js"
import { AnthropicProvider } from "./anthropic.js"
import { OllamaProvider, createOllamaProvider } from "./ollama.js"

export interface ProviderConfig {
  name: string
  model?: string
  apiKey?: string
  baseUrl?: string
}

export function createProvider(
  name: string,
  config?: Record<string, string>,
): LLMProvider {
  switch (name.toLowerCase()) {
    case "openai":
      return new OpenAIProvider(config?.apiKey, config?.baseUrl)
    case "anthropic":
    case "claude":
      return new AnthropicProvider(config?.apiKey, config?.baseUrl)
    case "ollama":
    case "local":
      return createOllamaProvider(config?.baseUrl, config?.model || "phi3:mini-128k")
    case "phi3":
      return createOllamaProvider(config?.baseUrl, "phi3:mini-128k")
    default:
      throw new Error(`Unknown provider: ${name}`)
  }
}

export function getDefaultProvider(): LLMProvider {
  // Priority: Local (Phi3) > OpenAI > Anthropic
  if (process.env.OLLAMA_HOST || process.env.LOCAL_LLM) {
    console.log("🤖 Using local model (Phi3:mini-128k)")
    return createOllamaProvider(undefined, "phi3:mini-128k")
  }
  
  if (process.env.OPENAI_API_KEY) {
    console.log("🤖 Using OpenAI")
    return new OpenAIProvider()
  }
  
  if (process.env.ANTHROPIC_API_KEY) {
    console.log("🤖 Using Anthropic Claude")
    return new AnthropicProvider()
  }
  
  // Default to local model
  console.log("🤖 Defaulting to local model (Phi3:mini-128k)")
  return createOllamaProvider(undefined, "phi3:mini-128k")
}

export async function detectLocalModels(): Promise<string[]> {
  try {
    const provider = createOllamaProvider()
    const models = await provider.listModels()
    return models
  } catch {
    return []
  }
}

export async function isLocalModelAvailable(model = "phi3:mini-128k"): Promise<boolean> {
  try {
    const models = await detectLocalModels()
    return models.includes(model)
  } catch {
    return false
  }
}
