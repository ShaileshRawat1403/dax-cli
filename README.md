<p align="center">
  <img src="https://img.shields.io/badge/CogNito-Decision--Aware%20AI-22c55e?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0xMiAyYTEwIDEwIDAgMSAwIDAgMjAgMTAgMTAgMCAwIDAgMC0yMHoiLz48cGF0aCBkPSJNMTIgNnY2bDQgMiIvPjwvc3ZnPg==" alt="CogNito Badge">
</p>
<p align="center"><strong>The decision-aware AI coding agent for professional developers.</strong></p>
<p align="center">
  <a href="https://github.com/AnomalyCo/cognito"><img alt="GitHub" src="https://img.shields.io/badge/github-cognito-22c55e?style=flat-square&logo=github" /></a>
  <a href="https://www.npmjs.com/package/cognito-ai"><img alt="npm" src="https://img.shields.io/badge/npm-cognito--ai-22c55e?style=flat-square&logo=npm" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" /></a>
</p>

---

## What is CogNito?

CogNito is an open source, decision-aware AI coding agent designed for professional developers. Unlike traditional AI coding assistants that act as autopilots, CogNito makes its reasoning, assumptions, risks, and tradeoffs **explicit, reviewable, and controllable**.

CogNito operates using **structured artifacts**. Free-form reasoning is not allowed. Every task produces mandatory work notes, decision logs, and metric comparisons.

**A collaborator, not an autopilot.**

---

## Key Features

### Structured Work Notes (Mandatory)
Every task produces a complete structured artifact:

```yaml
work_notes:
  intent:
    what_im_trying_to_do: "Refactor auth middleware"
    why_this_matters: "Enterprise needs session support"
  hypothesis:
    expected_outcome: "Dual auth with zero JWT regression"
    success_metrics:
      - "All 47 tests pass"
      - "Latency < +5ms"
  plan:
    steps: [...]
    alternatives_considered: [...]
    rationale: "Strategy pattern preserves existing code"
  scope:
    allowed_files: ["src/auth/*"]
    max_files: 6
    max_loc: 200
  assumptions:
    - "Redis available for session storage"
  risks:
    technical: ["Session fixation"]
    behavioral: ["Set-Cookie header changes"]
  decision_log:
    why_this_approach: "Testable in isolation"
  next_steps:
    will_try_next: "Implement SessionStrategy"
    requires_approval: "Adding redis dependency"
```

### Sacred Scope
- Declare allowed files, max files, and max lines of code
- Agent halts if scope needs to be exceeded
- Requires explicit approval to expand

### Experimentation Mode
- Create Variant A (baseline) and Variant B (proposed)
- Run identical tests or simulations
- Report deltas clearly
- Never silently replace the baseline

### Repo Contract Enforcement
Define project rules in `.cognito/contract.yaml`:

```yaml
contract:
  error_handling:
    pattern: "result"
    require_error_codes: true
  testing:
    allow_mocks: false
    min_branch_coverage: 80
  forbidden:
    types: ["any"]
    apis: ["console.log", "fs.readFileSync"]
  architecture:
    di_only: true
    max_nesting: 3
```

### Partial Acceptance
Outputs are separated into: **PLAN**, **CODE**, **TESTS**, **METRICS**
- Accept plan but reject code
- Keep tests but discard refactor
- Request a smaller or safer diff

### Fail-Safe Behavior
If scope is exceeded, assumptions fail, metrics regress, or tests contradict intent:
**CogNito STOPS and explains. It does not continue autonomously.**

---

## Installation

```bash
# Quick install
curl -fsSL https://cognito.dev/install | bash

# npm / bun / pnpm / yarn
npm i -g cognito-ai@latest

# Homebrew (macOS and Linux)
brew install cognito-ai/tap/cognito

# Windows
scoop install cognito
choco install cognito

# Arch Linux
paru -S cognito-bin

# Nix
nix run nixpkgs#cognito

# Any OS via mise
mise use -g cognito
```

### Desktop App (Beta)

| Platform              | Download                             |
| --------------------- | ------------------------------------ |
| macOS (Apple Silicon) | `cognito-desktop-darwin-aarch64.dmg` |
| macOS (Intel)         | `cognito-desktop-darwin-x64.dmg`     |
| Windows               | `cognito-desktop-windows-x64.exe`    |
| Linux                 | `.deb`, `.rpm`, or AppImage          |

```bash
# macOS
brew install --cask cognito-desktop
# Windows
scoop bucket add extras; scoop install extras/cognito-desktop
```

---

## Agents

CogNito includes three built-in agents. Switch between them with `Tab`.

| Agent       | Role        | Description                                                    |
| ----------- | ----------- | -------------------------------------------------------------- |
| **build**   | Default     | Full-access agent with work notes, scope lock, and contracts   |
| **plan**    | Read-only   | Analysis and exploration without modifying code                |
| **general** | Subagent    | Complex search and multistep tasks via `@general`              |

---

## Core Operating Principles

1. **Think in Plans, Not Actions** - Generate structured plan before any code change
2. **Explain Before Act** - What changes, why, alternatives, what could break
3. **Scope is Sacred** - Never exceed declared scope without approval
4. **Assumptions Must Be Declared** - Explicit, tracked, invalidation triggers re-plan
5. **Code Changes Are Experiments** - Compare outcomes, not just correctness

---

## Architecture

CogNito follows a client/server architecture:

- **Core** (`packages/cognito`): Business logic, server, agent system
- **TUI** (`packages/cognito/src/cli/cmd/tui/`): Terminal UI in SolidJS
- **Web App** (`packages/app`): Shared web UI components (SolidJS)
- **Desktop** (`packages/desktop`): Native app (Tauri wraps web app)
- **Plugin** (`packages/plugin`): Plugin SDK (`@cognito-ai/plugin`)

---

## How is this different from other AI coding agents?

| Feature                | CogNito | Others |
| ---------------------- | ------- | ------ |
| Structured work notes  | Yes     | No     |
| Scope enforcement      | Yes     | No     |
| Decision logging       | Yes     | No     |
| Experimentation mode   | Yes     | No     |
| Repo contracts         | Yes     | No     |
| Partial acceptance     | Yes     | Limited|
| Open source            | Yes     | Varies |
| Provider-agnostic      | Yes     | Rarely |
| Built-in LSP           | Yes     | Varies |
| TUI + Desktop + Web    | Yes     | Rarely |

---

## Documentation

For full documentation, visit **[cognito.dev/docs](https://cognito.dev/docs)**.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines. Key points:

- Bug fixes, LSP additions, LLM improvements, and new providers welcome
- UI/core features require design review
- PRs must reference an existing issue
- Follow conventional commit standards for PR titles

---

## Security

See [SECURITY.md](./SECURITY.md) for our threat model and vulnerability reporting.

---

## License

MIT License. See [LICENSE](./LICENSE).

---

**Join our community:** [Discord](https://discord.gg/cognito) | [X.com](https://x.com/cognito_dev)
