import { LLMProvider } from "./types"

export interface ProviderConstructor {
  new (apiKey?: string, baseUrl?: string): LLMProvider
}

export interface ProviderOptions {
  description: string
  type: 'open_source' | 'commercial' | 'specialized'
  pricing: ProviderPricing
  capabilities: ProviderCapabilities
}

export interface ProviderPricing {
  freeTier: boolean
  payAsYouGo: string
  enterprise: boolean
  costCalculator?: (usage: Usage) => number
}

export interface ProviderCapabilities {
  toolCalling: boolean
  streaming: boolean
  contextWindow: number
  modelDiscovery: boolean
}

export interface Usage {
  tokens: number
  requests: number
}

export interface ProviderInfo {
  name: string
  description: string
  type: 'open_source' | 'commercial' | 'specialized'
  pricing: ProviderPricing
  capabilities: ProviderCapabilities
}

export class ProviderRegistry {
  private static providers = new Map<string, { constructor: ProviderConstructor; options?: ProviderOptions }>()

  static register(name: string, constructor: ProviderConstructor, options?: ProviderOptions): void {
    this.providers.set(name.toLowerCase(), { constructor, options })
  }

  static create(name: string, config?: Record<string, string>): LLMProvider {
    const provider = this.providers.get(name.toLowerCase())
    if (!provider) {
      throw new Error(`Unknown provider: ${name}`)
    }
    
    const apiKey = config?.apiKey || process.env[`${name.toUpperCase()}_API_KEY`]
    const baseUrl = config?.baseUrl || provider.options?.pricing?.baseUrl
    
    return new provider.constructor(apiKey, baseUrl)
  }

  static list(): ProviderInfo[] {
    return Array.from(this.providers.entries()).map(([name, { options }]) => ({
      name,
      description: options?.description || "",
      type: options?.type || "open_source",
      pricing: options?.pricing || { freeTier: false, payAsYouGo: "", enterprise: false },
      capabilities: options?.capabilities || { toolCalling: false, streaming: false, contextWindow: 0, modelDiscovery: false }
    }))
  }

  static get(name: string): { constructor: ProviderConstructor; options?: ProviderOptions } | undefined {
    return this.providers.get(name.toLowerCase())
  }

  static exists(name: string): boolean {
    return this.providers.has(name.toLowerCase())
  }
}

// Default cost calculator for pay-as-you-go providers
export function defaultCostCalculator(provider: string, usage: Usage): number {
  const providers = {
    "huggingface": 0.10, // $0.10 per 1M tokens
    "together": 0.10,    // $0.10 per 1M tokens
    "google": 0.50,     // $0.50 per 1M tokens
    "openai": 0.03,     // $0.03 per 1M tokens
    "anthropic": 0.03   // $0.03 per 1M tokens
  }
  
  const rate = providers[provider.toLowerCase()] || 0.10
  return (usage.tokens / 1_000_000) * rate
}

// Usage tracking
export interface UsageRecord {
  provider: string
  tokens: number
  requests: number
  cost: number
  timestamp: Date
}

export class UsageTracker {
  private records: UsageRecord[] = []

  track(provider: string, tokens: number, cost: number): void {
    const record: UsageRecord = {
      provider,
      tokens,
      requests: 1,
      cost,
      timestamp: new Date()
    }
    this.records.push(record)
  }

  getUsage(provider?: string): UsageRecord[] {
    if (provider) {
      return this.records.filter(r => r.provider === provider)
    }
    return this.records
  }

  getTotalCost(): number {
    return this.records.reduce((total, record) => total + record.cost, 0)
  }
}

// Export a singleton instance
export const usageTracker = new UsageTracker()