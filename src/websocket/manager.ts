import type { ServerWebSocket } from "bun";
import { randomUUID } from "crypto";

export interface WebSocketClient {
  id: string;
  socket: ServerWebSocket<unknown>;
  subscribedChannels: Set<string>;
}

export interface WebSocketMessage {
  type: string;
  channel?: string;
  data?: unknown;
  timestamp: string;
}

export class WebSocketManager {
  private clients: Map<string, WebSocketClient>;
  private channels: Map<string, Set<string>>; // channel -> client ids

  constructor() {
    this.clients = new Map();
    this.channels = new Map();
  }

  addClient(socket: ServerWebSocket<unknown>): string {
    const clientId = `ws-${randomUUID()}`;
    const client: WebSocketClient = {
      id: clientId,
      socket,
      subscribedChannels: new Set(),
    };
    this.clients.set(clientId, client);
    return clientId;
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      // Unsubscribe from all channels
      client.subscribedChannels.forEach((channel) => {
        this.unsubscribe(clientId, channel);
      });
      this.clients.delete(clientId);
    }
  }

  subscribe(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.subscribedChannels.add(channel);

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(clientId);

    return true;
  }

  unsubscribe(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.subscribedChannels.delete(channel);

    const channelClients = this.channels.get(channel);
    if (channelClients) {
      channelClients.delete(clientId);
      if (channelClients.size === 0) {
        this.channels.delete(channel);
      }
    }

    return true;
  }

  broadcast(message: WebSocketMessage, channel?: string): void {
    const data = JSON.stringify(message);

    if (channel) {
      // Broadcast to specific channel
      const channelClients = this.channels.get(channel);
      if (channelClients) {
        channelClients.forEach((clientId) => {
          const client = this.clients.get(clientId);
          if (client && client.socket.readyState === 1) {
            client.socket.send(data);
          }
        });
      }
    } else {
      // Broadcast to all clients
      this.clients.forEach((client) => {
        if (client.socket.readyState === 1) {
          client.socket.send(data);
        }
      });
    }
  }

  sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== 1) return false;

    client.socket.send(JSON.stringify(message));
    return true;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getChannelCount(): number {
    return this.channels.size;
  }

  getChannelSubscribers(channel: string): number {
    return this.channels.get(channel)?.size || 0;
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();

// Event types for real-time updates
export const WebSocketEvents = {
  // Agent events
  AGENT_STARTED: "agent:started",
  AGENT_MESSAGE: "agent:message",
  AGENT_COMPLETED: "agent:completed",
  AGENT_ERROR: "agent:error",

  // Work notes events
  WORK_NOTE_CREATED: "work_note:created",
  WORK_NOTE_UPDATED: "work_note:updated",
  WORK_NOTE_DELETED: "work_note:deleted",

  // Decision events
  DECISION_CREATED: "decision:created",
  DECISION_UPDATED: "decision:updated",

  // Experiment events
  EXPERIMENT_STARTED: "experiment:started",
  EXPERIMENT_COMPLETED: "experiment:completed",

  // File events
  FILE_MODIFIED: "file:modified",
  FILE_CREATED: "file:created",

  // Validation events
  CONTRACT_VIOLATION: "contract:violation",
  SCOPE_WARNING: "scope:warning",

  // System events
  PING: "ping",
  PONG: "pong",
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
} as const;

// Helper functions for broadcasting common events
export function broadcastAgentStarted(agentId: string, task: string): void {
  wsManager.broadcast({
    type: WebSocketEvents.AGENT_STARTED,
    data: { agentId, task },
    timestamp: new Date().toISOString(),
  });
}

export function broadcastAgentMessage(agentId: string, message: string, role: string): void {
  wsManager.broadcast({
    type: WebSocketEvents.AGENT_MESSAGE,
    data: { agentId, message, role },
    timestamp: new Date().toISOString(),
  });
}

export function broadcastAgentCompleted(agentId: string, success: boolean): void {
  wsManager.broadcast({
    type: WebSocketEvents.AGENT_COMPLETED,
    data: { agentId, success },
    timestamp: new Date().toISOString(),
  });
}

export function broadcastWorkNoteCreated(noteId: string, title: string): void {
  wsManager.broadcast({
    type: WebSocketEvents.WORK_NOTE_CREATED,
    data: { noteId, title },
    timestamp: new Date().toISOString(),
  });
}

export function broadcastFileModified(filePath: string, changeType: "created" | "modified" | "deleted"): void {
  wsManager.broadcast({
    type: changeType === "created" ? WebSocketEvents.FILE_CREATED : WebSocketEvents.FILE_MODIFIED,
    data: { filePath, changeType },
    timestamp: new Date().toISOString(),
  });
}

export function broadcastContractViolation(filePath: string, violations: string[]): void {
  wsManager.broadcast({
    type: WebSocketEvents.CONTRACT_VIOLATION,
    channel: "validations",
    data: { filePath, violations },
    timestamp: new Date().toISOString(),
  });
}

export function broadcastScopeWarning(warning: string): void {
  wsManager.broadcast({
    type: WebSocketEvents.SCOPE_WARNING,
    channel: "validations",
    data: { warning },
    timestamp: new Date().toISOString(),
  });
}
