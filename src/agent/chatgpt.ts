import type { LLMConfig, LLMResponse, Message, Tool } from "../llm/types.js";

export class ChatGPTProvider {
  name = "chatgpt-plus";
  private apiKey: string;
  private subscriptionToken: string;
  private bridgeUrl: string;
  private mode: "auto" | "subscription" | "api";
  private model: string;
  private baseUrl: string;
  private refreshToken: string;
  private tokenUrl: string;

  constructor(config: {
    apiKey?: string;
    accessToken?: string;
    model?: string;
    baseUrl?: string;
    mode?: "auto" | "subscription" | "api";
  }) {
    const raw = (
      config.apiKey ||
      process.env.OPENAI_API_KEY ||
      process.env.CHATGPT_PLUS_API_KEY ||
      ""
    ).trim();
    this.apiKey = raw === "/" ? "" : raw;
    this.subscriptionToken = (process.env.CHATGPT_SUBSCRIPTION_TOKEN || "").trim();
    this.refreshToken = (process.env.CHATGPT_SUBSCRIPTION_REFRESH_TOKEN || "").trim();
    this.bridgeUrl =
      (process.env.CHATGPT_SUBSCRIPTION_BRIDGE_URL || "").trim() ||
      "http://localhost:4096/api/subscription/chat/completions";
    this.tokenUrl =
      (process.env.CHATGPT_SUBSCRIPTION_TOKEN_URL || "").trim() ||
      "http://localhost:4096/api/oauth/token";
    this.mode = config.mode || "auto";
    this.model = config.model || "gpt-4o";
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
  }

  private async refreshSubscriptionToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
        client_id: "dax-cli",
      }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (!data.access_token) return false;
    this.subscriptionToken = String(data.access_token).trim();
    process.env.CHATGPT_SUBSCRIPTION_TOKEN = this.subscriptionToken;
    if (data.refresh_token && String(data.refresh_token).trim()) {
      this.refreshToken = String(data.refresh_token).trim();
      process.env.CHATGPT_SUBSCRIPTION_REFRESH_TOKEN = this.refreshToken;
    }
    return true;
  }

  async complete(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): Promise<LLMResponse> {
    if (this.mode === "subscription" && !this.subscriptionToken) {
      throw new Error(
        "CHATGPT_SUBSCRIPTION_TOKEN is required for subscription mode. Run '/connect' and choose ChatGPT subscription.",
      );
    }

    if (this.mode === "api" && !this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY or CHATGPT_PLUS_API_KEY is required for API mode.",
      );
    }

    if (this.mode === "auto" && !this.apiKey && !this.subscriptionToken) {
      throw new Error(
        "Missing ChatGPT auth. Set CHATGPT_SUBSCRIPTION_TOKEN or OPENAI_API_KEY.",
      );
    }

    const body: Record<string, unknown> = {
      model: config?.model || this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
      })),
      temperature: config?.temperature ?? 0.2,
      max_tokens: config?.max_tokens ?? 4096,
      top_p: config?.top_p ?? 1,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const useSubscription =
      this.mode === "subscription" ||
      (this.mode === "auto" && Boolean(this.subscriptionToken));

    let response = useSubscription
      ? await fetch(this.bridgeUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.subscriptionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })
      : await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

    if (useSubscription && (response.status === 401 || response.status === 403)) {
      const refreshed = await this.refreshSubscriptionToken();
      if (refreshed) {
        response = await fetch(this.bridgeUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.subscriptionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const text = await response.text();
      if (useSubscription && response.status === 401) {
        throw new Error(
          "ChatGPT subscription token is invalid or expired. Run '/connect' and choose ChatGPT Subscription again.",
        );
      }
      throw new Error(`OpenAI API Error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;

    return {
      content: choice?.content || "",
      tool_calls: choice?.tool_calls,
      usage: data.usage,
    };
  }

  async *stream(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): AsyncGenerator<LLMResponse> {
    if (this.mode === "subscription" && !this.subscriptionToken) {
      throw new Error(
        "CHATGPT_SUBSCRIPTION_TOKEN is required for subscription mode. Run '/connect' and choose ChatGPT subscription.",
      );
    }

    if (this.mode === "api" && !this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY or CHATGPT_PLUS_API_KEY is required for API mode.",
      );
    }

    if (this.mode === "auto" && !this.apiKey && !this.subscriptionToken) {
      throw new Error(
        "Missing ChatGPT auth. Set CHATGPT_SUBSCRIPTION_TOKEN or OPENAI_API_KEY.",
      );
    }

    const body: Record<string, unknown> = {
      model: config?.model || this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
      })),
      temperature: config?.temperature ?? 0.2,
      max_tokens: config?.max_tokens ?? 4096,
      top_p: config?.top_p ?? 1,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const useSubscription =
      this.mode === "subscription" ||
      (this.mode === "auto" && Boolean(this.subscriptionToken));

    let response = useSubscription
      ? await fetch(this.bridgeUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.subscriptionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })
      : await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

    if (useSubscription && (response.status === 401 || response.status === 403)) {
      const refreshed = await this.refreshSubscriptionToken();
      if (refreshed) {
        response = await fetch(this.bridgeUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.subscriptionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const text = await response.text();
      if (useSubscription && response.status === 401) {
        throw new Error(
          "ChatGPT subscription token is invalid or expired. Run '/connect' and choose ChatGPT Subscription again.",
        );
      }
      throw new Error(`OpenAI API Error: ${response.status} - ${text}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      const raw = await response.text();
      const data = JSON.parse(raw);
      const choice = data.choices?.[0]?.message;
      yield {
        content: choice?.content || "",
        tool_calls: choice?.tool_calls,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("OpenAI stream failed: no response body");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          const delta = data.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.content || delta.tool_calls) {
            yield {
              content: delta.content || "",
              tool_calls: delta.tool_calls,
            };
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }
}
