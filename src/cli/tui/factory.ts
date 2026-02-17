import type { TUIBackend, TUIType, TUIOptions } from "./interfaces/backend.js";
import { createBlessedBackend } from "./blessed/index.js";
import { createRatatuiBackend } from "./ratatui/index.js";

export function createTUIBackend(options: TUIOptions = {}): TUIBackend {
  const { type, devMode = false } = options;

  // Determine TUI type based on:
  // 1. Explicit option
  // 2. Environment variable
  // 3. devMode flag (dev = blessed, prod = ratatui)
  let tuiType: TUIType;

  if (type) {
    tuiType = type;
  } else {
    const envType = process.env.DAX_TUI?.toLowerCase();
    if (envType === "ratatui" || envType === "blessed") {
      tuiType = envType;
    } else if (devMode) {
      tuiType = "blessed"; // Dev: Better DX with blessed
    } else {
      tuiType = "ratatui"; // Prod: Better UX with ratatui
    }
  }

  // Ratatui backend currently has stdin/input-reader conflicts in this runtime.
  // Keep explicit opt-in via DAX_TUI_EXPERIMENTAL_RATATUI=true.
  if (tuiType === "ratatui") {
    const experimental = (process.env.DAX_TUI_EXPERIMENTAL_RATATUI || "").toLowerCase() === "true";
    if (!experimental) {
      console.warn("Ratatui backend is temporarily unstable in this build; falling back to Blessed.");
      tuiType = "blessed";
    } else {
      try {
        return createRatatuiBackend();
      } catch (error) {
        console.warn("Failed to start Ratatui backend, falling back to Blessed:", error);
        tuiType = "blessed";
      }
    }
  }

  // Try Blessed, but handle TTY errors gracefully
  if (tuiType === "blessed") {
    try {
      return createBlessedBackend();
    } catch (error) {
      console.error("Failed to start Blessed TUI:", error);
      console.error("\n💡 The TUI requires a real terminal.");
      console.error("   Use interactive mode instead: bun src/cli/main.ts -i");
      console.error("   Or run in your actual terminal, not in a sandbox/remote environment.\n");
      throw new Error("TUI not available in this environment");
    }
  }

  throw new Error("No TUI backend available");
}

export type { TUIBackend, TUIType, TUIOptions, DaxStreamEvent, StreamState } from "./interfaces/backend.js";
