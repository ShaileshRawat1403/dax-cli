# CogNito - Practical Features Guide

## 🚀 Quick Start with Local Phi3

### Check Your Local Models
```bash
./start.sh cli --list-models
# or
bun src/cli/main.ts --list-models
```

### Use Local Phi3 (Easiest Way)
```bash
# Use the -l flag for local mode
bun src/cli/main.ts -l "Refactor auth middleware"

# Interactive mode with local model
bun src/cli/main.ts -l -i

# Plan mode (read-only analysis)
bun src/cli/main.ts -l -m plan "Analyze the codebase"
```

## 🛠️ New Practical Features

### 1. **Code Analysis** (`analyze_code`)
Analyze code complexity, dependencies, and structure:

```bash
bun src/cli/main.ts -l "Analyze the src/ directory"
```

**What it does:**
- Counts lines of code, comments, blank lines
- Identifies functions and classes
- Extracts import dependencies
- Determines complexity (low/medium/high)
- Shows file statistics

### 2. **Git Integration** (`git_status`, `git_diff`)
Built-in git awareness:

```bash
bun src/cli/main.ts -l "Check git status and show recent commits"
```

**Features:**
- Shows current branch
- Lists modified/staged files
- Displays recent commits
- Shows diffs for changes
- Works with unstaged and staged changes

### 3. **Test Generation** (`generate_tests`)
Automatically generate test scaffolding:

```bash
bun src/cli/main.ts -l "Generate tests for src/utils.ts"

# Specify framework
bun src/cli/main.ts -l "Generate vitest tests for src/api.ts"
```

**Supports:**
- Bun test
- Vitest
- Jest
- Mocha

Automatically:
- Detects exported functions and classes
- Creates test file with proper naming
- Adds basic test structure
- Imports the module under test

### 4. **Project Scaffolding** (`scaffold_project`)
Create new projects from templates:

```bash
# Basic TypeScript project
bun src/cli/main.ts -l "Create a TypeScript project called my-app"

# API server
bun src/cli/main.ts -l "Scaffold an API project called my-api"

# CLI tool
bun src/cli/main.ts -l "Create a CLI project called my-cli"
```

**Templates Available:**
- `basic` - Simple JavaScript project
- `typescript` - TypeScript with tsconfig
- `api` - Hono API server
- `cli` - CLI tool with bin entry
- `react` - React project structure

### 5. **Batch File Operations** (`batch_edit`)
Edit multiple files at once:

```bash
# Preview changes first
bun src/cli/main.ts -l "Find 'oldFunction' in src/**/*.ts and replace with 'newFunction' (preview)"

# Apply changes
bun src/cli/main.ts -l "Replace 'console.log' with '// console.log' in all src files"
```

**Features:**
- Glob pattern matching
- Preview mode (dry run)
- Shows affected files count
- Reports changes per file

### 6. **File Watching** (`watch_files`)
Set up file watchers with commands:

```bash
bun src/cli/main.ts -l "Watch src/**/*.ts and run 'bun test' when files change"
```

Creates a watcher script at `.cognito/watcher.ts`

## 📋 Usage Examples

### Example 1: Complete Workflow
```bash
# 1. Analyze your codebase
bun src/cli/main.ts -l "Analyze src/ and tell me about the architecture"

# 2. Generate tests for a module
bun src/cli/main.ts -l "Generate tests for src/auth.ts"

# 3. Check git status before committing
bun src/cli/main.ts -l "Show me what changed in git"

# 4. Scaffold a new feature
bun src/cli/main.ts -l "Create a TypeScript project for a new payment service"
```

### Example 2: Interactive Development
```bash
# Start interactive mode
bun src/cli/main.ts -l -i

> Analyze the codebase
[Agent analyzes and shows work notes]

> Generate tests for the main module
[Agent creates test files]

> Show git status
[Agent shows current branch and changes]

> Create a new API endpoint for users
[Agent scaffolds the endpoint]
```

### Example 3: Refactoring Project
```bash
# 1. Plan the refactoring (read-only mode)
bun src/cli/main.ts -l -m plan "Plan refactoring auth from JWT to session-based"

# 2. Execute the refactoring
bun src/cli/main.ts -l "Refactor auth middleware to use sessions"

# 3. Generate tests for new code
bun src/cli/main.ts -l "Generate tests for the new session auth"

# 4. Check what changed
bun src/cli/main.ts -l "Show git diff"
```

## 🔧 Configuration

### Environment Variables
```bash
# For OpenAI (optional, local is default)
export OPENAI_API_KEY="sk-..."

# For Anthropic (optional)
export ANTHROPIC_API_KEY="sk-ant-..."

# For custom Ollama host
export OLLAMA_HOST="http://localhost:11434"

# Force local mode
export LOCAL_LLM=1
```

### Model Selection
```bash
# Use specific local model
bun src/cli/main.ts -p ollama -M phi3:latest "Your task"

# Use Phi3 specifically
bun src/cli/main.ts -p phi3 "Your task"

# Auto-detect (tries local first)
bun src/cli/main.ts "Your task"
```

## 🎯 Common Tasks

### Task: "Create a new TypeScript project"
```bash
bun src/cli/main.ts -l "Scaffold a TypeScript project called todo-app"
```
**Agent will:**
- Create directory structure
- Generate package.json with TypeScript
- Create tsconfig.json
- Add basic src/index.ts
- Create README.md

### Task: "Analyze and document code"
```bash
bun src/cli/main.ts -l "Analyze src/ and generate documentation"
```
**Agent will:**
- Scan all source files
- Count lines, functions, classes
- Identify imports/dependencies
- Create complexity report
- Generate docs explaining the architecture

### Task: "Batch rename across files"
```bash
bun src/cli/main.ts -l "Replace 'ApiService' with 'APIService' in all TypeScript files"
```
**Agent will:**
- Find all matching files
- Show preview of changes
- Apply edits to each file
- Report success/failure per file

### Task: "Check project health"
```bash
bun src/cli/main.ts -l "Show git status, analyze code complexity, and check for TODOs"
```
**Agent will:**
- Run git status
- Analyze codebase
- Search for TODO/FIXME comments
- Provide comprehensive report

## 💡 Tips for Local Models

### Optimized for Phi3:mini-128k
- Uses 128k context window
- Optimized tool calling format
- Temperature: 0.2 (focused)
- Reduced tool set for better performance
- Custom system prompts

### When to Use Local vs Cloud

**Use Local (-l flag) when:**
- ✅ Working offline
- ✅ Privacy concerns
- ✅ Fast iteration on small tasks
- ✅ No API costs
- ✅ Simple refactoring/analysis

**Use Cloud (OpenAI/Anthropic) when:**
- 🌐 Complex reasoning tasks
- 🌐 Large codebase analysis
- 🌐 Need best-in-class code generation
- 🌐 Working with unfamiliar languages

### Performance Tips
1. **Break large tasks into smaller ones**
   ```bash
   # Instead of one big task:
   bun src/cli/main.ts -l "Analyze entire codebase"
   
   # Do it module by module:
   bun src/cli/main.ts -l "Analyze src/auth/"
   bun src/cli/main.ts -l "Analyze src/api/"
   ```

2. **Use plan mode first**
   ```bash
   bun src/cli/main.ts -l -m plan "Plan the refactoring"
   ```

3. **Batch similar operations**
   ```bash
   bun src/cli/main.ts -l "Replace all 'var' with 'const' in src/"
   ```

## 🔍 Troubleshooting

### "Phi3 not found"
```bash
# Pull the model
ollama pull phi3:mini-128k

# Verify it's running
ollama list
```

### "Tool execution failed"
- Check file permissions
- Ensure you're in the right directory
- Verify git repository (for git tools)

### "Response is slow"
- Local models are slower than cloud APIs
- Reduce context by specifying smaller file patterns
- Use `-m plan` for analysis (no tool execution)

## 📚 All Available Tools

### Basic Tools
- `read_file` - Read file contents
- `write_file` - Write/create files
- `edit_file` - Replace text in files
- `list_dir` - List directory contents
- `bash` - Execute shell commands
- `glob` - Find files by pattern
- `grep` - Search file contents

### Advanced Tools
- `analyze_code` - Code analysis & metrics
- `git_status` - Check git status
- `git_diff` - Show git diffs
- `generate_tests` - Generate test scaffolding
- `scaffold_project` - Create project templates
- `batch_edit` - Edit multiple files
- `watch_files` - Setup file watchers

## 🚀 Next Steps

1. **Try the examples above**
2. **Experiment with interactive mode**: `bun src/cli/main.ts -l -i`
3. **Create your own project templates**
4. **Extend with custom tools**

---

**Note:** All features work with local Phi3 model. No API keys required!
