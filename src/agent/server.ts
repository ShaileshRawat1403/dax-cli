import { Hono } from "hono";
import { createToolRegistry } from "../tools/index.js";

const app = new Hono();
const tools = createToolRegistry();

// MCP Discovery Endpoint
app.get("/mcp/tools", (c) => {
  const toolList = tools.toLLMTools().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  return c.json({ tools: toolList });
});

// MCP Execution Endpoint
app.post("/mcp/execute", async (c) => {
  const body = await c.req.json();
  const { tool, args } = body;

  const toolInstance = tools.get(tool);
  if (!toolInstance) {
    return c.json({ error: "Tool not found" }, 404);
  }

  try {
    const result = await toolInstance.execute(args, {
      workDir: process.cwd(),
      scope: { files: [], maxFiles: 10, maxLoc: 1000 }, // Default safe scope
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

const PORT = 8080;
console.log(`🚀 MCP Server running on http://localhost:${PORT}`);
console.log(`📋 Tools available at http://localhost:${PORT}/mcp/tools`);

export default {
  port: PORT,
  fetch: app.fetch,
};
