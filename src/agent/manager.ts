import { randomUUID } from "crypto";
import { createAgent } from "./index.js";
import { getDefaultProvider, createProvider } from "../llm/index.js";
import { createToolRegistry } from "../tools/index.js";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq, sql, ne } from "drizzle-orm";
import { GeminiProvider } from "./gemini.js";
import { ChatGPTProvider } from "./chatgpt.js";
import { CodexProvider } from "./codex.js";
import { GeminiCliProvider } from "./gemini-cli.js";
import { ClaudeCliProvider } from "./claude-cli.js";

export class AgentManager {
  // Keep active instances in memory for WebSocket/State connections
  private activeInstances = new Map<string, any>();

  async createAgent(userId: string, body: any) {
    const agentId = `agent-${randomUUID()}`;

    let provider;
    if (body.provider === "gemini") {
      // @ts-ignore
      provider = new GeminiProvider({
        accessToken: process.env.GOOGLE_ACCESS_TOKEN,
      });
    } else if (body.provider === "chatgpt-codex") {
      // @ts-ignore
      provider = new CodexProvider();
    } else if (body.provider === "gemini-cli") {
      // @ts-ignore
      provider = new GeminiCliProvider();
    } else if (body.provider === "claude-cli") {
      // @ts-ignore
      provider = new ClaudeCliProvider();
    } else if (body.provider === "chatgpt-plus") {
      // @ts-ignore
      provider = new ChatGPTProvider({
        apiKey: process.env.CHATGPT_PLUS_API_KEY || process.env.OPENAI_API_KEY,
        mode: "auto",
      });
    } else if (body.provider === "chatgpt-subscription") {
      // @ts-ignore
      provider = new ChatGPTProvider({
        apiKey: process.env.CHATGPT_PLUS_API_KEY || process.env.OPENAI_API_KEY,
        mode: "subscription",
      });
    } else if (body.provider === "chatgpt-api") {
      // @ts-ignore
      provider = new ChatGPTProvider({
        apiKey: process.env.CHATGPT_PLUS_API_KEY || process.env.OPENAI_API_KEY,
        mode: "api",
      });
    } else {
      provider = body.provider
        ? createProvider(body.provider)
        : getDefaultProvider();
    }

    const tools = createToolRegistry();

    const agent = createAgent({
      name: "dax",
      mode: body.mode,
      provider,
      tools,
      workDir: process.cwd(),
      requireApproval: body.require_approval,
    });

    await agent.startTask(body.task);

    // Persist to DB
    await db.insert(agents).values({
      id: agentId,
      userId,
      task: body.task,
      mode: body.mode,
      provider: body.provider || null,
      status: "running",
      requireApproval: body.require_approval,
      conversation: agent.getConversation(),
      workNotes: agent.getWorkNotes(),
    });

    this.activeInstances.set(agentId, { agent, userId });
    return { agentId, agent };
  }

  async getAgent(agentId: string) {
    // 1. Check memory cache
    if (this.activeInstances.has(agentId)) {
      return { ...this.activeInstances.get(agentId), status: "running" };
    }

    // 2. Check Database
    const [row] = await db.select().from(agents).where(eq(agents.id, agentId));

    if (!row) return null;

    // 3. Rehydrate Agent
    let provider;
    if (row.provider === "gemini") {
      // @ts-ignore
      provider = new GeminiProvider({
        accessToken: process.env.GOOGLE_ACCESS_TOKEN,
      });
    } else if (row.provider === "chatgpt-codex") {
      // @ts-ignore
      provider = new CodexProvider();
    } else if (row.provider === "gemini-cli") {
      // @ts-ignore
      provider = new GeminiCliProvider();
    } else if (row.provider === "claude-cli") {
      // @ts-ignore
      provider = new ClaudeCliProvider();
    } else if (row.provider === "chatgpt-plus") {
      // @ts-ignore
      provider = new ChatGPTProvider({
        apiKey: process.env.CHATGPT_PLUS_API_KEY || process.env.OPENAI_API_KEY,
        mode: "auto",
      });
    } else if (row.provider === "chatgpt-subscription") {
      // @ts-ignore
      provider = new ChatGPTProvider({
        apiKey: process.env.CHATGPT_PLUS_API_KEY || process.env.OPENAI_API_KEY,
        mode: "subscription",
      });
    } else if (row.provider === "chatgpt-api") {
      // @ts-ignore
      provider = new ChatGPTProvider({
        apiKey: process.env.CHATGPT_PLUS_API_KEY || process.env.OPENAI_API_KEY,
        mode: "api",
      });
    } else {
      provider = row.provider
        ? createProvider(row.provider)
        : getDefaultProvider();
    }

    const tools = createToolRegistry();

    const agent = createAgent({
      name: "dax",
      mode: row.mode as "build" | "plan",
      provider,
      tools,
      workDir: process.cwd(),
      requireApproval: row.requireApproval === true,
    });

    if (row.conversation) {
      agent.loadHistory(row.conversation);
    }
    if (row.workNotes) {
      agent.setWorkNotes(row.workNotes);
    }

    const session = { agent, userId: row.userId };

    if (row.status === "running") {
      this.activeInstances.set(agentId, session);
    }

    return { ...session, status: row.status };
  }

  async updateAgent(agentId: string, agent: any) {
    await db
      .update(agents)
      .set({
        conversation: agent.getConversation(),
        workNotes: agent.getWorkNotes(),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(agents.id, agentId));
  }

  async deleteAgent(agentId: string) {
    this.activeInstances.delete(agentId);
    await db.delete(agents).where(eq(agents.id, agentId));
  }

  async pauseAgent(agentId: string) {
    await db
      .update(agents)
      .set({
        status: "paused",
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(agents.id, agentId));
    this.activeInstances.delete(agentId);
  }

  async resumeAgent(agentId: string) {
    await db
      .update(agents)
      .set({
        status: "running",
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(agents.id, agentId));
  }

  async listAgents(includeArchived = false) {
    const allAgents = await db
      .select()
      .from(agents)
      .where(includeArchived ? undefined : ne(agents.status, "archived"))
      .orderBy(sql`${agents.updatedAt} DESC`);

    return allAgents.map((a) => ({
      id: a.id,
      task: a.task,
      status: a.status,
      mode: a.mode,
      updatedAt: a.updatedAt,
    }));
  }
}

export const agentManager = new AgentManager();
