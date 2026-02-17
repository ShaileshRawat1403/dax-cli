#!/usr/bin/env bun

import { createTUIBackend } from "./factory.js";

const args = process.argv.slice(2);

let devMode = true;

for (const arg of args) {
  if (arg === "--ratatui") {
    process.env.DAX_TUI = "ratatui";
    devMode = false;
  } else if (arg === "--blessed") {
    process.env.DAX_TUI = "blessed";
    devMode = true;
  } else if (arg === "--prod") {
    devMode = false;
  }
}

const tui = createTUIBackend({ devMode });

console.log(`Starting DAX TUI (${tui.name} backend)`);
console.log("Dev mode:", devMode);
console.log("Press Ctrl+C to exit\n");

tui.setSendHandler(async (message: string) => {
  console.log("User message:", message);

  const words = ["Hello!", "I'm DAX.", "How can I help you today?"];
  for (const word of words) {
    tui.dispatch({ type: "text_delta", timestamp: Date.now(), data: { text: word + " " } });
    await new Promise((r) => setTimeout(r, 300));
  }
  tui.dispatch({ type: "complete", timestamp: Date.now(), data: {} });
});

tui.setCommandHandler((cmd) => {
  console.log("Command:", cmd);
});

tui.setContext({
  files: ["src/main.ts", "src/utils.ts"],
  scope: ["src/", "package.json"],
});

tui.focusInput();

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  tui.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  tui.destroy();
  process.exit(0);
});
