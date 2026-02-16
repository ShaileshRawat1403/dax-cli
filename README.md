# DAX

Decision-aware coding agent built on Bun with a local API server and interactive TUI.

## Quick Start

```bash
npm install
npm run start:api
npm run cli:interactive
```

In TUI:

- `/connect` to authenticate providers
- `/provider` to switch provider
- `/status` to inspect auth/model/mode

## Core Commands

- `npm run start:api` start API + websocket server (`src/server.ts`)
- `npm run cli:interactive` start TUI (`src/cli/main.ts`)
- `npm run verify:auth` auth diagnostics
- `npm test` run Bun unit tests

## Directory Structure

```text
.
├── bridges/
│   └── subscription-bridge/      # Optional upstream bridge service
├── packages/
│   ├── app/                      # Web app
│   └── desktop/                  # Tauri desktop wrapper
├── src/
│   ├── agent/                    # Agent runtime + providers
│   ├── auth/                     # OAuth helpers
│   ├── cli/                      # Interactive CLI + control commands
│   ├── db/                       # SQLite schema/init
│   ├── llm/                      # Provider interfaces + API providers
│   ├── oauth/                    # Device flow endpoints
│   ├── tools/                    # Tool registry + tool implementations
│   ├── websocket/                # WS manager
│   ├── index.tsx                 # API routes
│   ├── server.ts                 # Bun server bootstrap
│   └── verify-subscriptions.ts   # Auth/subscription verification script
├── .dax/contract.yaml        # Repo behavior contract
├── Makefile
└── package.json
```

## Providers

### CLI-adapter providers (recommended for subscription UX)

- `chatgpt-codex` (uses local `codex` CLI)
- `gemini-cli` (uses local `gemini` CLI)
- `claude-cli` (uses local `claude` CLI)

### Direct providers

- `chatgpt-api`, `chatgpt-subscription`, `chatgpt-plus`
- `openai`, `anthropic`, `gemini`, `ollama`

## Orchestrator-only Mode

To keep TUI focused on adapter providers only:

```env
DAX_ORCHESTRATOR_ONLY=true # legacy: COGNITO_ORCHESTRATOR_ONLY=true
```

This restricts provider choices to:

- `chatgpt-codex`
- `gemini-cli`
- `claude-cli`
- `ollama`
- `phi3`

## Testing

This repo uses Bun tests.

```bash
npm test
```

Current tests include prompt-template unit coverage under `src/agent/*.test.ts`.
