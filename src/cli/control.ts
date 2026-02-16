#!/usr/bin/env bun

const API_URL = process.env.DAX_API_URL || process.env.COGNITO_API_URL || "http://localhost:4096/api";

async function callApi(endpoint: string, method: string) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, { method });
    const data = await response.json();

    if (!response.ok) {
      console.error(`Error: ${data.error || "Unknown error"}`);
      process.exit(1);
    }

    return data;
  } catch (error) {
    console.error("Failed to connect to API. Is the server running?");
    process.exit(1);
  }
}

const command = process.argv[2];
const agentId = process.argv[3];

if (!command) {
  console.log("Usage: bun src/cli/control.ts <list|pause|resume> [agentId]");
  process.exit(1);
}

switch (command) {
  case "pause":
    console.log(`⏸️  Pausing agent ${agentId}...`);
    await callApi(`/agent/${agentId}/pause`, "POST");
    console.log(`✅ Agent ${agentId} paused.`);
    break;

  case "resume":
    console.log(`▶️  Resuming agent ${agentId}...`);
    await callApi(`/agent/${agentId}/resume`, "POST");
    console.log(`✅ Agent ${agentId} resumed.`);
    break;

  case "list":
    console.log("📋 Listing active agents...");
    const agents = await callApi("/agent", "GET");

    if (Array.isArray(agents) && agents.length > 0) {
      console.table(
        agents.map((a: any) => ({
          ID: a.id,
          Status: a.status,
          Mode: a.mode,
          Task: a.task.length > 60 ? a.task.substring(0, 57) + "..." : a.task,
          Updated: new Date(a.updatedAt).toLocaleString(),
        })),
      );
    } else {
      console.log("No agents found.");
    }
    break;

  default:
    if ((command === "pause" || command === "resume") && !agentId) {
      console.log(`Usage: bun src/cli/control.ts ${command} <agentId>`);
      process.exit(1);
    }
    console.log(`Unknown command: ${command}`);
    console.log("Available commands: list, pause, resume");
    process.exit(1);
}

export {};
