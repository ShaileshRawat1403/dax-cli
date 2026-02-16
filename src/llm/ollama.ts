import type { LLMProvider, LLMResponse, Message, Tool, LLMConfig } from "./types.js";
import { LLMError } from "./types.js";

interface OllamaModelConfig {
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  systemPromptTemplate?: string;
}

// Optimized configurations for different models
const MODEL_CONFIGS: Record<string, OllamaModelConfig> = {
  "phi3:mini-128k": {
    name: "phi3:mini-128k",
    contextWindow: 128000,
    supportsTools: false, // Phi3 doesn't natively support function calling
    systemPromptTemplate: `You are a helpful coding assistant running locally via Ollama.
You have access to tools. When you need to use a tool, respond in this exact format:

<tool>
name: tool_name
arguments:
  param1: value1
  param2: value2
</tool>

Available tools:
{tools}

Think step by step and use tools when needed.`,
  },
  "phi3:latest": {
    name: "phi3:latest",
    contextWindow: 4096,
    supportsTools: false,
    systemPromptTemplate: `You are a helpful coding assistant running locally via Ollama.
You have access to tools. When you need to use a tool, respond in this exact format:

<tool>
name: tool_name
arguments:
  param1: value1
  param2: value2
</tool>

Available tools:
{tools}`,
  },
  "llama3.2": {
    name: "llama3.2",
    contextWindow: 128000,
    supportsTools: false,
    systemPromptTemplate: `You are a helpful coding assistant.
You have access to tools. When you need to use a tool, respond with:
{"tool": "tool_name", "arguments": {...}}

Available tools:
{tools}`,
  },
  "codellama": {
    name: "codellama",
    contextWindow: 16000,
    supportsTools: false,
    systemPromptTemplate: `You are an expert coding assistant specialized in code analysis and generation.
You have access to tools. When you need to use a tool, respond with:
{"tool": "tool_name", "arguments": {...}}

Available tools:
{tools}`,
  },
};

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private baseUrl: string;
  private defaultModel: string;
  private modelConfig: OllamaModelConfig;

  constructor(baseUrl = "http://localhost:11434", defaultModel = "phi3:mini-128k") {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
    this.modelConfig = MODEL_CONFIGS[defaultModel] || MODEL_CONFIGS["phi3:mini-128k"];
  }

  setModel(model: string) {
    this.defaultModel = model;
    this.modelConfig = MODEL_CONFIGS[model] || {
      name: model,
      contextWindow: 4096,
      supportsTools: false,
    };
  }

  private formatToolsForPrompt(tools?: Tool[]): string {
    if (!tools || tools.length === 0) return "None";
    
    return tools.map(t => {
      const params = Object.entries(t.function.parameters.properties)
        .map(([key, value]: [string, any]) => `    ${key}: ${value.description}`)
        .join("\n");
      
      return `- ${t.function.name}: ${t.function.description}\n  Parameters:\n${params}`;
    }).join("\n\n");
  }

  private extractToolCalls(content: string): { content: string; toolCalls?: any[] } {
    const toolCalls: any[] = [];
    let cleanContent = content;

    // Parse Phi3-style tool format
    const phi3ToolRegex = /<tool>\s*name:\s*(\w+)\s*arguments:\s*([\s\S]*?)<\/tool>/g;
    let match;
    
    while ((match = phi3ToolRegex.exec(content)) !== null) {
      try {
        const toolName = match[1];
        const argsYaml = match[2];
        
        // Parse YAML-like format
        const args: Record<string, any> = {};
        const lines = argsYaml.split("\n");
        let currentKey = "";
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          if (trimmed.includes(":")) {
            const [key, ...valueParts] = trimmed.split(":");
            const value = valueParts.join(":").trim();
            currentKey = key.trim();
            
            // Try to parse as JSON, otherwise keep as string
            try {
              args[currentKey] = JSON.parse(value);
            } catch {
              args[currentKey] = value;
            }
          }
        }

        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify(args),
          },
        });

        // Remove the tool call from content
        cleanContent = cleanContent.replace(match[0], "");
      } catch (e) {
        console.error("Failed to parse tool call:", e);
      }
    }

    // Also try JSON format
    try {
      const jsonMatch = content.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      if (jsonMatch && toolCalls.length === 0) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tool) {
          toolCalls.push({
            id: `call_${Date.now()}`,
            type: "function",
            function: {
              name: parsed.tool,
              arguments: JSON.stringify(parsed.arguments || {}),
            },
          });
          cleanContent = cleanContent.replace(jsonMatch[0], "");
        }
      }
    } catch {
      // Not JSON, ignore
    }

    return {
      content: cleanContent.trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  async complete(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): Promise<LLMResponse> {
    const model = config?.model || this.defaultModel;
    const modelConfig = MODEL_CONFIGS[model] || this.modelConfig;

    // Build system prompt with tools
    let systemContent = messages.find((m) => m.role === "system")?.content || "";
    
    if (tools && tools.length > 0 && !modelConfig.supportsTools) {
      const toolsDescription = this.formatToolsForPrompt(tools);
      const toolTemplate = modelConfig.systemPromptTemplate || MODEL_CONFIGS["phi3:mini-128k"].systemPromptTemplate || "";
      systemContent = toolTemplate.replace("{tools}", toolsDescription) + "\n\n" + systemContent;
    }

    const conversationMessages = messages.filter((m) => m.role !== "system");

    // Calculate appropriate context window
    const contextWindow = modelConfig.contextWindow;
    const maxTokens = config?.max_tokens || Math.min(4096, contextWindow / 4);

    const body = {
      model: model,
      messages: systemContent
        ? [{ role: "system", content: systemContent }, ...conversationMessages]
        : conversationMessages,
      stream: false,
      options: {
        temperature: config?.temperature ?? 0.2,
        num_predict: maxTokens,
        top_p: config?.top_p ?? 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new LLMError(
          `Ollama request failed: ${response.statusText}`,
          "ollama",
          `HTTP_${response.status}`,
        );
      }

      const data = await response.json();
      const content = data.message?.content || "";

      // Extract tool calls from response
      const { content: cleanContent, toolCalls } = this.extractToolCalls(content);

      return {
        content: cleanContent,
        tool_calls: toolCalls,
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens:
            (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        error instanceof Error ? error.message : "Unknown error",
        "ollama",
        "REQUEST_FAILED",
      );
    }
  }

  async *stream(
    messages: Message[],
    tools?: Tool[],
    config?: LLMConfig,
  ): AsyncGenerator<LLMResponse> {
    const model = config?.model || this.defaultModel;
    const modelConfig = MODEL_CONFIGS[model] || this.modelConfig;

    let systemContent = messages.find((m) => m.role === "system")?.content || "";
    
    if (tools && tools.length > 0 && !modelConfig.supportsTools) {
      const toolsDescription = this.formatToolsForPrompt(tools);
      const toolTemplate = modelConfig.systemPromptTemplate || MODEL_CONFIGS["phi3:mini-128k"].systemPromptTemplate || "";
      systemContent = toolTemplate.replace("{tools}", toolsDescription) + "\n\n" + systemContent;
    }

    const conversationMessages = messages.filter((m) => m.role !== "system");
    const contextWindow = modelConfig.contextWindow;
    const maxTokens = config?.max_tokens || Math.min(4096, contextWindow / 4);

    const body = {
      model: model,
      messages: systemContent
        ? [{ role: "system", content: systemContent }, ...conversationMessages]
        : conversationMessages,
      stream: true,
      options: {
        temperature: config?.temperature ?? 0.2,
        num_predict: maxTokens,
        top_p: config?.top_p ?? 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new LLMError(
        `Ollama request failed: ${response.statusText}`,
        "ollama",
        `HTTP_${response.status}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new LLMError("No response body", "ollama", "NO_BODY");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed);
          if (data.message?.content) {
            const chunk = data.message.content;
            fullContent += chunk;
            
            // Yield incremental content
            yield {
              content: chunk,
            };
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // At the end, extract any tool calls from full content
    const { toolCalls } = this.extractToolCalls(fullContent);
    if (toolCalls) {
      yield {
        content: "",
        tool_calls: toolCalls,
      };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new LLMError("Failed to list models", "ollama", "LIST_FAILED");
      }
      const data = await response.json();
      return data.models?.map((m: { name: string }) => m.name) || [];
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        error instanceof Error ? error.message : "Unknown error",
        "ollama",
        "LIST_FAILED",
      );
    }
  }

  async pullModel(model: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model }),
      });

      if (!response.ok) {
        throw new LLMError(
          `Failed to pull model: ${response.statusText}`,
          "ollama",
          `HTTP_${response.status}`,
        );
      }
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        error instanceof Error ? error.message : "Unknown error",
        "ollama",
        "PULL_FAILED",
      );
    }
  }
}

export function createOllamaProvider(baseUrl?: string, defaultModel = "phi3:mini-128k"): OllamaProvider {
  return new OllamaProvider(baseUrl, defaultModel);
}
