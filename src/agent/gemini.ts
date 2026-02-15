import {
  getGeminiOAuthConfig,
  refreshGeminiAccessToken,
  resolveGeminiAccessToken,
  syncGeminiEnv,
} from "../auth/gemini.js";
import type { LLMConfig, LLMResponse, Message, Tool } from "../llm/types.js";

export class GeminiProvider {
  name = "gemini";
  private accessToken: string;
  private model: string;
  private projectId: string;

  constructor(config: { accessToken?: string; model?: string }) {
    syncGeminiEnv();
    this.accessToken = config.accessToken || "";
    this.model = config.model || "gemini-2.0-flash";
    this.projectId = process.env.GOOGLE_PROJECT_ID || process.env.GEMINI_PROJECT_ID || "";
  }

  async complete(messages: Message[], _tools?: Tool[], config?: LLMConfig): Promise<LLMResponse> {
    const prompt = messages.map((msg) => `${msg.role.toUpperCase()}:\n${msg.content}`).join("\n\n");
    const url = this.projectId
      ? `https://us-central1-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/us-central1/publishers/google/models/${config?.model || this.model}:generateContent`
      : `https://generativelanguage.googleapis.com/v1beta/models/${config?.model || this.model}:generateContent`;
    const token = this.accessToken?.trim() || (await resolveGeminiAccessToken());
    const payload = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    });

    let response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: payload,
    });

    if (
      (response.status === 401 || response.status === 403) &&
      getGeminiOAuthConfig().clientId &&
      getGeminiOAuthConfig().refreshToken
    ) {
      const config = getGeminiOAuthConfig();
      const refreshed = await refreshGeminiAccessToken(
        config.clientId,
        config.clientSecret,
        config.refreshToken,
      );
      const next = refreshed.access_token?.trim() || "";
      if (next) {
        this.accessToken = next;
        process.env.GOOGLE_ACCESS_TOKEN = next;
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${next}`,
            "Content-Type": "application/json",
          },
          body: payload,
        });
      }
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || "" };
  }

  async *stream(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): AsyncGenerator<LLMResponse> {
    const out = await this.complete(messages, tools, config);
    if (!out.content) {
      yield { content: "", tool_calls: out.tool_calls, usage: out.usage };
      return;
    }
    for (let i = 0; i < out.content.length; i += 120) {
      yield { content: out.content.slice(i, i + 120) };
    }
    if (out.tool_calls?.length) {
      yield { content: "", tool_calls: out.tool_calls };
    }
  }
}
