/**
 * LSP (Language Server Protocol) Integration
 * 
 * Provides code intelligence features by communicating with language servers.
 */

import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";

// LSP Message types
export interface LSPMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: LSError;
}

export interface LSError {
  code: number;
  message: string;
  data?: unknown;
}

// LSP Client capabilities
export interface ClientCapabilities {
  textDocument?: {
    synchronization?: {
      dynamicRegistration?: boolean;
      willSave?: boolean;
      willSaveWaitUntil?: boolean;
      didSave?: boolean;
    };
    completion?: {
      dynamicRegistration?: boolean;
      completionItem?: {
        snippetSupport?: boolean;
        commitCharactersSupport?: boolean;
        documentationFormat?: string[];
        deprecatedSupport?: boolean;
        preselectSupport?: boolean;
      };
    };
    hover?: {
      dynamicRegistration?: boolean;
      contentFormat?: string[];
    };
    definition?: {
      dynamicRegistration?: boolean;
      linkSupport?: boolean;
    };
    documentSymbol?: {
      dynamicRegistration?: boolean;
      hierarchicalDocumentSymbolSupport?: boolean;
    };
    codeAction?: {
      dynamicRegistration?: boolean;
      codeActionLiteralSupport?: {
        codeActionKind: {
          valueSet: string[];
        };
      };
    };
    formatting?: {
      dynamicRegistration?: boolean;
    };
    rename?: {
      dynamicRegistration?: boolean;
      prepareSupport?: boolean;
    };
    publishDiagnostics?: {
      relatedInformation?: boolean;
      versionSupport?: boolean;
      tagSupport?: {
        valueSet: number[];
      };
    };
  };
  workspace?: {
    applyEdit?: boolean;
    workspaceEdit?: {
      documentChanges?: boolean;
    };
    didChangeConfiguration?: {
      dynamicRegistration?: boolean;
    };
    didChangeWatchedFiles?: {
      dynamicRegistration?: boolean;
    };
    executeCommand?: {
      dynamicRegistration?: boolean;
    };
    configuration?: boolean;
    workspaceFolders?: boolean;
  };
}

// LSP Server information
export interface LSPServerConfig {
  command: string;
  args?: string[];
  workspace?: string;
  rootUri?: string;
  fileTypes?: string[];
}

// Code intelligence results
export interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number;
}

export interface HoverResult {
  contents: string | { language: string; value: string };
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface DefinitionResult {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}

export class LSPClient {
  private process: ChildProcess | null = null;
  private messageBuffer = "";
  private requestId = 0;
  private pendingRequests = new Map<number | string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private notificationHandlers = new Map<string, (params: unknown) => void>();
  private isInitialized = false;
  private config: LSPServerConfig;

  constructor(config: LSPServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.config.command, this.config.args || [], {
          cwd: this.config.workspace || process.cwd(),
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.process.stdout?.on("data", (data: Buffer) => {
          this.handleData(data);
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          console.error(`[LSP ${this.config.command}] ${data.toString()}`);
        });

        this.process.on("error", (error) => {
          reject(error);
        });

        this.process.on("exit", (code) => {
          console.log(`[LSP ${this.config.command}] exited with code ${code}`);
          this.process = null;
        });

        // Give the server a moment to start
        setTimeout(resolve, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  async initialize(): Promise<void> {
    const rootUri = this.config.rootUri || `file://${this.config.workspace || process.cwd()}`;
    
    const result = await this.sendRequest("initialize", {
      processId: process.pid,
      rootUri,
      capabilities: this.getClientCapabilities(),
      workspaceFolders: [
        {
          uri: rootUri,
          name: "workspace",
        },
      ],
    });

    this.isInitialized = true;
    
    // Send initialized notification
    this.sendNotification("initialized", {});
    
    return result as void;
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;
    
    await this.sendRequest("shutdown", {});
    this.sendNotification("exit", {});
    
    this.process?.kill();
    this.process = null;
    this.isInitialized = false;
  }

  // Text Document Synchronization
  async didOpen(uri: string, languageId: string, version: number, text: string): Promise<void> {
    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    });
  }

  async didChange(uri: string, version: number, changes: Array<{ range?: unknown; text: string }>): Promise<void> {
    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri,
        version,
      },
      contentChanges: changes,
    });
  }

  async didSave(uri: string): Promise<void> {
    this.sendNotification("textDocument/didSave", {
      textDocument: {
        uri,
      },
    });
  }

  async didClose(uri: string): Promise<void> {
    this.sendNotification("textDocument/didClose", {
      textDocument: {
        uri,
      },
    });
  }

  // Language Features
  async completion(uri: string, line: number, character: number): Promise<CompletionItem[]> {
    const result = await this.sendRequest("textDocument/completion", {
      textDocument: { uri },
      position: { line, character },
    });
    
    if (Array.isArray(result)) {
      return result as CompletionItem[];
    } else if (result && typeof result === "object" && "items" in result) {
      return (result as { items: CompletionItem[] }).items;
    }
    return [];
  }

  async hover(uri: string, line: number, character: number): Promise<HoverResult | null> {
    const result = await this.sendRequest("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    });
    return result as HoverResult | null;
  }

  async definition(uri: string, line: number, character: number): Promise<DefinitionResult | DefinitionResult[] | null> {
    const result = await this.sendRequest("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    });
    return result as DefinitionResult | DefinitionResult[] | null;
  }

  async documentSymbol(uri: string): Promise<unknown[]> {
    const result = await this.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    return result as unknown[] || [];
  }

  async formatting(uri: string): Promise<unknown[] | null> {
    const result = await this.sendRequest("textDocument/formatting", {
      textDocument: { uri },
      options: {
        tabSize: 2,
        insertSpaces: true,
      },
    });
    return result as unknown[] | null;
  }

  // Code Action
  async codeAction(uri: string, range: unknown, context: unknown): Promise<unknown[]> {
    const result = await this.sendRequest("textDocument/codeAction", {
      textDocument: { uri },
      range,
      context,
    });
    return result as unknown[] || [];
  }

  // Register notification handler
  onNotification(method: string, handler: (params: unknown) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  // Private methods
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error("LSP server not running"));
        return;
      }

      const id = ++this.requestId;
      const message: LSPMessage = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.sendMessage(message);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) {
      console.error("LSP server not running");
      return;
    }

    const message: LSPMessage = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.sendMessage(message);
  }

  private sendMessage(message: LSPMessage): void {
    const content = JSON.stringify(message);
    const headers = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    
    this.process?.stdin?.write(headers + content);
  }

  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();
    
    while (true) {
      // Parse Content-Length header
      const headerMatch = this.messageBuffer.match(/Content-Length: (\d+)\r\n/);
      if (!headerMatch) break;
      
      const contentLength = parseInt(headerMatch[1], 10);
      const headerEnd = this.messageBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      
      if (this.messageBuffer.length < messageEnd) break;
      
      const content = this.messageBuffer.substring(messageStart, messageEnd);
      this.messageBuffer = this.messageBuffer.substring(messageEnd);
      
      try {
        const message = JSON.parse(content) as LSPMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error("Failed to parse LSP message:", error);
      }
    }
  }

  private handleMessage(message: LSPMessage): void {
    // Handle response
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    }
    
    // Handle notification
    if (message.method && this.notificationHandlers.has(message.method)) {
      const handler = this.notificationHandlers.get(message.method);
      handler?.(message.params);
    }
  }

  private getClientCapabilities(): ClientCapabilities {
    return {
      textDocument: {
        synchronization: {
          dynamicRegistration: false,
          willSave: true,
          willSaveWaitUntil: false,
          didSave: true,
        },
        completion: {
          dynamicRegistration: false,
          completionItem: {
            snippetSupport: true,
            commitCharactersSupport: true,
            documentationFormat: ["markdown", "plaintext"],
            deprecatedSupport: true,
            preselectSupport: false,
          },
        },
        hover: {
          dynamicRegistration: false,
          contentFormat: ["markdown", "plaintext"],
        },
        definition: {
          dynamicRegistration: false,
          linkSupport: true,
        },
        documentSymbol: {
          dynamicRegistration: false,
          hierarchicalDocumentSymbolSupport: true,
        },
        codeAction: {
          dynamicRegistration: false,
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: ["", "quickfix", "refactor", "source"],
            },
          },
        },
        formatting: {
          dynamicRegistration: false,
        },
        rename: {
          dynamicRegistration: false,
          prepareSupport: false,
        },
        publishDiagnostics: {
          relatedInformation: true,
          versionSupport: true,
          tagSupport: {
            valueSet: [1, 2],
          },
        },
      },
      workspace: {
        applyEdit: true,
        workspaceEdit: {
          documentChanges: true,
        },
        didChangeConfiguration: {
          dynamicRegistration: false,
        },
        didChangeWatchedFiles: {
          dynamicRegistration: false,
        },
        executeCommand: {
          dynamicRegistration: false,
        },
        configuration: false,
        workspaceFolders: true,
      },
    };
  }
}

// LSP Manager for multiple language servers
export class LSPManager {
  private clients = new Map<string, LSPClient>();

  async startServer(languageId: string, config: LSPServerConfig): Promise<LSPClient> {
    const client = new LSPClient(config);
    await client.start();
    await client.initialize();
    this.clients.set(languageId, client);
    return client;
  }

  getClient(languageId: string): LSPClient | undefined {
    return this.clients.get(languageId);
  }

  async stopAll(): Promise<void> {
    for (const [id, client] of this.clients) {
      await client.shutdown();
      console.log(`Stopped LSP server for ${id}`);
    }
    this.clients.clear();
  }

  // TypeScript language server configuration
  static getTypeScriptConfig(workspace: string): LSPServerConfig {
    return {
      command: "typescript-language-server",
      args: ["--stdio"],
      workspace,
      rootUri: `file://${workspace}`,
      fileTypes: [".ts", ".tsx", ".js", ".jsx"],
    };
  }

  // Rust language server configuration
  static getRustConfig(workspace: string): LSPServerConfig {
    return {
      command: "rust-analyzer",
      workspace,
      rootUri: `file://${workspace}`,
      fileTypes: [".rs"],
    };
  }

  // Python language server configuration
  static getPythonConfig(workspace: string): LSPServerConfig {
    return {
      command: "pylsp",
      workspace,
      rootUri: `file://${workspace}`,
      fileTypes: [".py"],
    };
  }
}

// Export singleton
export const lspManager = new LSPManager();
