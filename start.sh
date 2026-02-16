#!/bin/bash

# DAX Launcher Script
# Starts both API server and Web UI

echo "🧠 DAX Launcher"
echo "=================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to cleanup processes on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down DAX...${NC}"
    kill $API_PID 2>/dev/null
    kill $WEB_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# Check if dependencies are installed
check_deps() {
    if ! command -v bun &> /dev/null; then
        echo "❌ Error: bun is not installed. Install from https://bun.sh"
        exit 1
    fi

    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}Installing dependencies...${NC}"
        npm install
    fi

    if [ ! -d "packages/app/node_modules" ]; then
        echo -e "${BLUE}Installing web app dependencies...${NC}"
        cd packages/app && npm install && cd ../..
    fi
}

# Start API Server
start_api() {
    echo -e "${BLUE}Starting API Server...${NC}"
    bun src/server.ts &
    API_PID=$!

    # Wait for API to be ready
    echo "Waiting for API server..."
    for i in {1..30}; do
        if curl -s http://localhost:4096/api/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ API Server ready at http://localhost:4096${NC}"
            return 0
        fi
        sleep 1
    done

    echo "❌ API server failed to start"
    return 1
}

# Start Web UI
start_web() {
    echo -e "${BLUE}Starting Web UI...${NC}"
    cd packages/app
    npx vite --port 5173 &
    WEB_PID=$!
    cd ../..

    sleep 3
    echo -e "${GREEN}✅ Web UI ready at http://localhost:5173${NC}"
}

# Main execution
main() {
    check_deps

    echo ""
    echo -e "${GREEN}Starting DAX...${NC}"
    echo ""

    start_api
    if [ $? -ne 0 ]; then
        exit 1
    fi

    start_web

    echo ""
    echo "=================="
    echo -e "${GREEN}🚀 DAX is running!${NC}"
    echo ""
    echo -e "${BLUE}Web UI:${NC}   http://localhost:5173"
    echo -e "${BLUE}API:${NC}      http://localhost:4096"
    echo -e "${BLUE}Health:${NC}   http://localhost:4096/api/health"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""

    # Wait for both processes
    wait
}

# Handle CLI arguments
case "${1:-}" in
    api)
        check_deps
        echo -e "${BLUE}Starting API Server only...${NC}"
        bun src/server.ts
        ;;
    web)
        check_deps
        echo -e "${BLUE}Starting Web UI only...${NC}"
        cd packages/app && npx vite --port 5173
        ;;
    cli)
        check_deps
        shift
        echo -e "${BLUE}Running CLI...${NC}"
        bun src/cli/main.ts "$@"
        ;;
    install|setup)
        echo -e "${BLUE}Setting up DAX...${NC}"
        npm install
        cd packages/app && npm install && cd ../..
        echo -e "${GREEN}✅ Setup complete!${NC}"
        ;;
    help|--help|-h)
        echo "DAX Launcher"
        echo ""
        echo "Usage: ./start.sh [command]"
        echo ""
        echo "Commands:"
        echo "  (no command)  Start both API and Web UI"
        echo "  api           Start API server only"
        echo "  web           Start Web UI only"
        echo "  cli [args]    Run CLI with arguments"
        echo "  install       Install all dependencies"
        echo "  help          Show this help"
        echo ""
        echo "Examples:"
        echo "  ./start.sh"
        echo "  ./start.sh api"
        echo "  ./start.sh cli \"Refactor auth middleware\""
        ;;
    *)
        main
        ;;
esac
