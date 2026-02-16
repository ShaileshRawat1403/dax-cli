/**
 * Represents the main configuration for DAX.
 * This would typically be loaded from a YAML file in ~/.cognito/config.yaml
 * or .cognito/config.yaml in the project root.
 */
export interface CognitoConfig {
  llm: {
    provider:
      | "ollama"
      | "openai"
      | "anthropic"
      | "chatgpt-plus"
      | "chatgpt-codex"
      | "chatgpt-subscription"
      | "chatgpt-api"
      | "gemini"
      | "gemini-cli"
      | "claude-cli";
    model: string; // e.g., 'phi3.5:latest' or 'gpt-4-turbo'
    embedding_model?: string; // e.g., 'nomic-embed-text:latest'
    api_key?: string;
    base_url?: string;
  };
  // ... other configurations
}

// Default configuration, can be overridden by user files.
export const defaultConfig: CognitoConfig = {
  llm: {
    provider: "ollama",
    model: "phi3.5:latest", // Updated based on your new models
    embedding_model: "nomic-embed-text:latest",
    base_url: "http://localhost:11434",
  },
};

/**
 * Concept for auto-detecting local Ollama models.
 * This function would execute `ollama list` and parse the output.
 * NOTE: This is a conceptual implementation. In the actual CLI/backend,
 * you'd use `Bun.spawn` or a similar process execution tool.
 * @returns A promise that resolves to an array of model names.
 */
export async function detectLocalOllamaModels(): Promise<string[]> {
  try {
    // In a real backend, you would run a shell command.
    // For this demonstration, we'll use a mock output based on your list.
    const mockOutput = `NAME                       ID              SIZE      MODIFIED
phi3.5:latest              61819fb370a3    2.2 GB    2 minutes ago
ministral-3:3b             f04aa1c738f6    3.0 GB    5 minutes ago
nomic-embed-text:latest    0a109f422b47    274 MB    2 months ago`;

    const lines = mockOutput.trim().split("\n");
    if (lines.length <= 1) return [];

    const models = lines.slice(1).map((line) => line.split(/\s+/)[0]);
    console.log("Auto-detected local models:", models);
    return models;
  } catch (error) {
    console.error(
      "Could not auto-detect Ollama models. Is Ollama running?",
      error,
    );
    return [];
  }
}
