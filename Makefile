# DAX Makefile
# Easy commands for common tasks

.PHONY: help install dev api web cli cli-tui stop test clean

# Default target
help:
	@echo "DAX - Decision-Aware AI Agent"
	@echo ""
	@echo "Available commands:"
	@echo "  make install    - Install all dependencies"
	@echo "  make dev        - Start API and Web UI (development mode)"
	@echo "  make api        - Start API server only"
	@echo "  make web        - Start Web UI only"
	@echo "  make cli        - Run CLI (use CLI_ARGS='your task')"
	@echo "  make cli-tui    - Start TUI mode (set TUI_BACKEND=ratatui|blessed)"
	@echo "  make stop       - Stop all running servers"
	@echo "  make test       - Run tests"
	@echo "  make clean      - Clean build files and dependencies"
	@echo ""
	@echo "Examples:"
	@echo "  make dev"
	@echo "  make cli CLI_ARGS='\"Refactor auth middleware\"'"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install
	cd packages/app && npm install
	@echo "✅ Dependencies installed!"

# Start both API and Web UI
dev:
	@echo "🚀 Starting DAX development environment..."
	@./start.sh

# Start API only
api:
	@echo "🖥️  Starting API server..."
	bun src/server.ts

# Start Web UI only
web:
	@echo "🌐 Starting Web UI..."
	cd packages/app && npx vite --port 5173

# Run CLI
cli:
	@if [ -z "$(CLI_ARGS)" ]; then \
		echo "Usage: make cli CLI_ARGS='your task here'"; \
		exit 1; \
	fi
	@echo "🤖 Running CLI..."
	bun src/cli/main.ts $(CLI_ARGS)

# TUI CLI
cli-tui:
	@echo "🖥️  Starting DAX TUI..."
	bun src/cli/main.ts --tui --tui-backend $${TUI_BACKEND:-blessed}

# Interactive CLI
cli-interactive:
	@echo "🤖 Starting interactive CLI..."
	bun src/cli/main.ts -i

# List all agents
list:
	@bun src/cli/control.ts list

# Pause an agent
pause:
	@if [ -z "$(ID)" ]; then echo "Usage: make pause ID=agent-id"; exit 1; fi
	@bun src/cli/control.ts pause $(ID)

# Resume an agent
resume:
	@if [ -z "$(ID)" ]; then echo "Usage: make resume ID=agent-id"; exit 1; fi
	@bun src/cli/control.ts resume $(ID)

# Archive old agents
cleanup:
	@bun src/cron/cleanup.ts

# Stop all servers
stop:
	@echo "🛑 Stopping DAX servers..."
	@pkill -f "bun src/index" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@echo "✅ Servers stopped"

# Test the API
test:
	@echo "🧪 Testing API..."
	@curl -s http://localhost:4096/api/health | jq . || echo "Server not running"

# Clean everything
clean:
	@echo "🧹 Cleaning..."
	rm -rf node_modules
	rm -rf packages/app/node_modules
	rm -rf packages/app/dist
	rm -f cognito.db dax.db
	@echo "✅ Cleaned!"

# Quick setup for new developers
setup: install
	@echo ""
	@echo "✅ Setup complete! Run 'make dev' to start DAX"
