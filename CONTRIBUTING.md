# Contributing to CogNito

We want to make it easy for you to contribute to CogNito. Here are the most common type of changes that get merged:

- Bug fixes
- Additional LSPs / Formatters
- Improvements to LLM performance
- Support for new providers
- Fixes for environment-specific quirks
- Missing standard behavior
- Documentation improvements
- New contract rule types
- Work notes structure enhancements

However, any UI or core product feature must go through a design review with the core team before implementation.

If you are unsure if a PR would be accepted, feel free to ask a maintainer or look for issues with any of the following labels:

- [`help wanted`](https://github.com/AnomalyCo/cognito/issues?q=is%3Aissue%20state%3Aopen%20label%3Ahelp-wanted)
- [`good first issue`](https://github.com/AnomalyCo/cognito/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22)
- [`bug`](https://github.com/AnomalyCo/cognito/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug)
- [`perf`](https://github.com/AnomalyCo/cognito/issues?q=is%3Aopen%20is%3Aissue%20label%3A%22perf%22)

> [!NOTE]
> PRs that ignore these guardrails will likely be closed.

Want to take on an issue? Leave a comment and a maintainer may assign it to you unless it is something we are already working on.

## Developing CogNito

- Requirements: Bun 1.3+
- Install dependencies and start the dev server from the repo root:

  ```bash
  bun install
  bun dev
  ```

### Running against a different directory

By default, `bun dev` runs CogNito in the `packages/cognito` directory. To run it against a different directory or repository:

```bash
bun dev <directory>
```

To run CogNito in the root of the cognito repo itself:

```bash
bun dev .
```

### Building a standalone binary

To compile a standalone executable:

```bash
./packages/cognito/script/build.ts --single
```

Then run it with:

```bash
./packages/cognito/dist/cognito-<platform>/bin/cognito
```

Replace `<platform>` with your platform (e.g., `darwin-arm64`, `linux-x64`).

- Core pieces:
  - `packages/cognito`: CogNito core business logic & server.
  - `packages/cognito/src/cli/cmd/tui/`: The TUI code, written in SolidJS with [opentui](https://github.com/sst/opentui)
  - `packages/app`: The shared web UI components, written in SolidJS
  - `packages/desktop`: The native desktop app, built with Tauri (wraps `packages/app`)
  - `packages/plugin`: Source for `@cognito-ai/plugin`

### Understanding bun dev vs cognito

During development, `bun dev` is the local equivalent of the built `cognito` command. Both run the same CLI interface:

```bash
# Development (from project root)
bun dev --help           # Show all available commands
bun dev serve            # Start headless API server
bun dev web              # Start server + open web interface
bun dev <directory>      # Start TUI in specific directory

# Production
cognito --help           # Show all available commands
cognito serve            # Start headless API server
cognito web              # Start server + open web interface
cognito <directory>      # Start TUI in specific directory
```

### Running the API Server

To start the CogNito headless API server:

```bash
bun dev serve
```

This starts the headless server on port 4096 by default. You can specify a different port:

```bash
bun dev serve --port 8080
```

### Running the Web App

To test UI changes during development:

1. **First, start the CogNito server** (see [Running the API Server](#running-the-api-server) section above)
2. **Then run the web app:**

```bash
bun run --cwd packages/app dev
```

This starts a local dev server at http://localhost:5173.

### Running the Desktop App

The desktop app is a native Tauri application that wraps the web UI.

```bash
bun run --cwd packages/desktop tauri dev
```

> [!NOTE]
> Running the desktop app requires additional Tauri dependencies (Rust toolchain, platform-specific libraries). See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for setup instructions.

Please try to follow the [style guide](./AGENTS.md)

## Pull Request Expectations

### Issue First Policy

**All PRs must reference an existing issue.** Before opening a PR, open an issue describing the bug or feature. PRs without a linked issue may be closed without review.

- Use `Fixes #123` or `Closes #123` in your PR description to link the issue

### General Requirements

- Keep pull requests small and focused
- Explain the issue and why your change fixes it
- Before adding new functionality, ensure it doesn't already exist elsewhere in the codebase

### UI Changes

If your PR includes UI changes, please include screenshots or videos showing the before and after.

### Logic Changes

For non-UI changes (bug fixes, new features, refactors), explain **how you verified it works**:

- What did you test?
- How can a reviewer reproduce/confirm the fix?

### No AI-Generated Walls of Text

Long, AI-generated PR descriptions are not acceptable. Write short, focused descriptions.

### PR Titles

PR titles should follow conventional commit standards:

- `feat:` new feature or functionality
- `fix:` bug fix
- `docs:` documentation or README changes
- `chore:` maintenance tasks, dependency updates
- `refactor:` code refactoring without changing behavior
- `test:` adding or updating tests

With optional scope: `feat(app):`, `fix(desktop):`, `chore(cognito):`

### Style Preferences

- **Functions:** Keep logic within a single function unless breaking it out adds clear reuse or composition benefits.
- **Control flow:** Avoid `else` statements. Prefer early returns.
- **Error handling:** Prefer `.catch(...)` instead of `try`/`catch` when possible.
- **Types:** Reach for precise types and avoid `any`.
- **Variables:** Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.
- **Naming:** Choose concise single-word identifiers when they remain descriptive.
- **Runtime APIs:** Use Bun helpers such as `Bun.file()` when they fit the use case.

## Feature Requests

For net-new functionality, start with a design conversation. Open an issue describing the problem, your proposed approach (optional), and why it belongs in CogNito. The core team will help decide whether it should move forward.
