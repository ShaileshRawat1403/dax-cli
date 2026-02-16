/**
 * DAX Plugin SDK
 * 
 * This SDK allows developers to create custom plugins for DAX.
 * Plugins can add new tools, hooks, and integrations.
 */

import type { Tool, ToolContext, ToolResult } from "../tools/types.js";
import type { AgentConfig, Agent } from "../agent/core.js";

// Plugin metadata
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  
  // DAX compatibility
  cognitoVersion: {
    min: string;
    max?: string;
  };
  
  // Plugin configuration
  config?: Record<string, unknown>;
  
  // Hooks this plugin provides
  hooks?: HookType[];
  
  // Tools this plugin provides
  tools?: string[];
}

// Plugin interface
export interface Plugin {
  manifest: PluginManifest;
  
  // Lifecycle hooks
  onLoad?(context: PluginContext): Promise<void> | void;
  onUnload?(context: PluginContext): Promise<void> | void;
  onAgentStart?(agent: Agent, config: AgentConfig): Promise<void> | void;
  onAgentComplete?(agent: Agent): Promise<void> | void;
  onToolCall?(toolName: string, args: Record<string, unknown>, context: ToolContext): Promise<void> | void;
  onToolResult?(toolName: string, result: ToolResult): Promise<void> | void;
  onFileChange?(filePath: string, changeType: "created" | "modified" | "deleted"): Promise<void> | void;
  onContractViolation?(violations: string[], filePath: string): Promise<void> | void;
  onScopeWarning?(warning: string): Promise<void> | void;
  
  // Tools provided by this plugin
  getTools?(): Tool[];
  
  // Configuration schema
  getConfigSchema?(): ConfigSchema;
}

// Plugin context provided to plugins
export interface PluginContext {
  // Configuration for this plugin
  config: Record<string, unknown>;
  
  // API access
  api: {
    // Register a tool
    registerTool(tool: Tool): void;
    
    // Unregister a tool
    unregisterTool(name: string): void;
    
    // Register a hook
    registerHook(hook: HookType, handler: HookHandler): void;
    
    // Unregister a hook
    unregisterHook(hook: HookType, handler: HookHandler): void;
    
    // Broadcast a message via WebSocket
    broadcast(channel: string, data: unknown): void;
    
    // Log a message
    log(level: "info" | "warn" | "error", message: string): void;
    
    // Access to work directory
    workDir: string;
    
    // Access to database (read-only by default)
    db: {
      query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
    };
  };
  
  // Event emitter for plugin-to-plugin communication
  events: PluginEventEmitter;
}

// Hook types
export type HookType = 
  | "agent:start"
  | "agent:complete"
  | "tool:before"
  | "tool:after"
  | "file:change"
  | "contract:violation"
  | "scope:warning";

// Hook handler type
export type HookHandler = (data: unknown) => Promise<void> | void;

// Config schema for plugin configuration
export interface ConfigSchema {
  type: "object";
  properties: Record<string, ConfigProperty>;
  required?: string[];
}

export interface ConfigProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

// Plugin event emitter
export interface PluginEventEmitter {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
}

// Plugin manager
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private hooks: Map<HookType, Set<HookHandler>> = new Map();
  private toolRegistry: Map<string, Tool> = new Map();
  private eventEmitter: PluginEventEmitter;
  
  constructor() {
    this.eventEmitter = this.createEventEmitter();
  }
  
  private createEventEmitter(): PluginEventEmitter {
    const listeners = new Map<string, Set<(data: unknown) => void>>();
    
    return {
      emit: (event: string, data: unknown) => {
        const handlers = listeners.get(event);
        if (handlers) {
          handlers.forEach(handler => handler(data));
        }
      },
      on: (event: string, handler: (data: unknown) => void) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(handler);
      },
      off: (event: string, handler: (data: unknown) => void) => {
        const handlers = listeners.get(event);
        if (handlers) {
          handlers.delete(handler);
        }
      },
    };
  }
  
  async loadPlugin(plugin: Plugin, config: Record<string, unknown> = {}): Promise<void> {
    const manifest = plugin.manifest;
    
    // Check if plugin is already loaded
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already loaded`);
    }
    
    // Validate manifest
    this.validateManifest(manifest);
    
    // Create plugin context
    const context = this.createPluginContext(manifest.id, config);
    
    // Register tools
    if (plugin.getTools) {
      const tools = plugin.getTools();
      tools.forEach(tool => {
        this.toolRegistry.set(tool.name, tool);
        context.api.registerTool(tool);
      });
    }
    
    // Register hooks
    if (plugin.onAgentStart) {
      this.registerHook("agent:start", plugin.onAgentStart.bind(plugin));
    }
    if (plugin.onAgentComplete) {
      this.registerHook("agent:complete", plugin.onAgentComplete.bind(plugin));
    }
    if (plugin.onToolCall) {
      this.registerHook("tool:before", plugin.onToolCall.bind(plugin));
    }
    if (plugin.onToolResult) {
      this.registerHook("tool:after", plugin.onToolResult.bind(plugin));
    }
    if (plugin.onFileChange) {
      this.registerHook("file:change", plugin.onFileChange.bind(plugin));
    }
    if (plugin.onContractViolation) {
      this.registerHook("contract:violation", plugin.onContractViolation.bind(plugin));
    }
    if (plugin.onScopeWarning) {
      this.registerHook("scope:warning", plugin.onScopeWarning.bind(plugin));
    }
    
    // Store plugin
    this.plugins.set(manifest.id, plugin);
    
    // Call onLoad
    if (plugin.onLoad) {
      await plugin.onLoad(context);
    }
    
    console.log(`✅ Plugin loaded: ${manifest.name} v${manifest.version}`);
  }
  
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }
    
    // Call onUnload
    if (plugin.onUnload) {
      const context = this.createPluginContext(pluginId, {});
      await plugin.onUnload(context);
    }
    
    // Unregister tools
    if (plugin.getTools) {
      const tools = plugin.getTools();
      tools.forEach(tool => {
        this.toolRegistry.delete(tool.name);
      });
    }
    
    // Remove plugin
    this.plugins.delete(pluginId);
    
    console.log(`🗑️  Plugin unloaded: ${pluginId}`);
  }
  
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id) {
      throw new Error("Plugin manifest must have an id");
    }
    if (!manifest.name) {
      throw new Error("Plugin manifest must have a name");
    }
    if (!manifest.version) {
      throw new Error("Plugin manifest must have a version");
    }
    if (!manifest.cognitoVersion?.min) {
      throw new Error("Plugin manifest must specify minimum DAX version");
    }
  }
  
  private createPluginContext(pluginId: string, config: Record<string, unknown>): PluginContext {
    return {
      config,
      api: {
        registerTool: (tool: Tool) => {
          this.toolRegistry.set(tool.name, tool);
        },
        unregisterTool: (name: string) => {
          this.toolRegistry.delete(name);
        },
        registerHook: (hook: HookType, handler: HookHandler) => {
          this.registerHook(hook, handler);
        },
        unregisterHook: (hook: HookType, handler: HookHandler) => {
          this.unregisterHook(hook, handler);
        },
        broadcast: (channel: string, data: unknown) => {
          // WebSocket broadcast would go here
          console.log(`[Plugin ${pluginId}] Broadcasting to ${channel}:`, data);
        },
        log: (level: "info" | "warn" | "error", message: string) => {
          console.log(`[Plugin ${pluginId}] [${level.toUpperCase()}] ${message}`);
        },
        workDir: process.cwd(),
        db: {
          query: async (_sql: string, _params?: unknown[]) => {
            // Database access - would be implemented with actual DB connection
            return [];
          },
        },
      },
      events: this.eventEmitter,
    };
  }
  
  private registerHook(hook: HookType, handler: HookHandler): void {
    if (!this.hooks.has(hook)) {
      this.hooks.set(hook, new Set());
    }
    this.hooks.get(hook)!.add(handler);
  }
  
  private unregisterHook(hook: HookType, handler: HookHandler): void {
    const handlers = this.hooks.get(hook);
    if (handlers) {
      handlers.delete(handler);
    }
  }
  
  async executeHook(hook: HookType, data: unknown): Promise<void> {
    const handlers = this.hooks.get(hook);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (error) {
          console.error(`Error executing hook ${hook}:`, error);
        }
      }
    }
  }
  
  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }
  
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  getTool(name: string): Tool | undefined {
    return this.toolRegistry.get(name);
  }
  
  getAllTools(): Tool[] {
    return Array.from(this.toolRegistry.values());
  }
  
  isLoaded(id: string): boolean {
    return this.plugins.has(id);
  }
}

// Base plugin class for easier plugin development
export abstract class BasePlugin implements Plugin {
  abstract manifest: PluginManifest;
  
  async onLoad?(context: PluginContext): Promise<void> | void {
    // Override in subclass
  }
  
  async onUnload?(context: PluginContext): Promise<void> | void {
    // Override in subclass
  }
  
  getTools?(): Tool[] {
    return [];
  }
  
  getConfigSchema?(): ConfigSchema {
    return {
      type: "object",
      properties: {},
    };
  }
}

// Plugin loader from filesystem
export async function loadPluginFromPath(pluginPath: string): Promise<Plugin> {
  // In a real implementation, this would:
  // 1. Check if it's a local file or npm package
  // 2. Load the plugin module
  // 3. Validate and return the plugin instance
  
  // For now, this is a placeholder
  const module = await import(pluginPath);
  return module.default || module;
}

// Plugin loader from npm
export async function loadPluginFromNpm(packageName: string): Promise<Plugin> {
  // In a real implementation, this would:
  // 1. Check if package is installed
  // 2. Install if needed
  // 3. Load and return the plugin
  
  const module = await import(packageName);
  return module.default || module;
}

// Create a plugin manifest helper
export function createManifest(
  id: string,
  name: string,
  version: string,
  description: string,
  options: Partial<PluginManifest> = {}
): PluginManifest {
  return {
    id,
    name,
    version,
    description,
    cognitoVersion: {
      min: "1.0.0",
    },
    ...options,
  };
}

// Export singleton instance
export const pluginManager = new PluginManager();
