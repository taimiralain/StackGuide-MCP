# StackGuide MCP Server

Dynamic context + active engineering workflow for AI coding assistants in Cursor, VS Code, and other MCP clients.

[![npm version](https://img.shields.io/npm/v/@stackguide/mcp-server.svg)](https://www.npmjs.com/package/@stackguide/mcp-server)
[![license](https://img.shields.io/badge/license-GPL--3.0-green.svg)](./LICENSE)
[![mcp registry](https://img.shields.io/badge/MCP%20Registry-io.github.isucorp--taimiralain%2Fstackguide--mcp-blue)](https://registry.modelcontextprotocol.io)

## What It Does

`@stackguide/mcp-server` helps teams standardize implementation quality with:

- project-aware rule/context loading
- code review and health scoring
- auto-detected setup and stack scaffolding
- active agent workflow that executes real work (`intake`, `plan`, `verify`, `release`)
- adaptive TDD preferences per project (model + token profile)
- Jira ticket creation from strict `MAIN DESCRIPTION` templates
- tracker + VCS + test orchestration for delivery flow
- bundled Ponytail MCP server (`stackguide-ponytail-mcp`) for on-demand lazy-senior-dev rules and lower token usage

This server is built for real team usage, not just prompt templates.

## What's New In v4.2

- Bundled **Ponytail MCP** (`stackguide-ponytail-mcp`) — on-demand YAGNI rules via prompt/tool instead of always-on context.
- Ponytail is a **core integration**: `init` always syncs it into `.mcp.json` / `.cursor/mcp.json` with `PONYTAIL_DEFAULT_MODE=lite`.
- MCP templates now use official remote endpoints for Atlassian, GitHub, and GitLab (OAuth, no manual token placeholders).

## What's New In v4.x

- Added active `agent` tool (execution-first workflow).
- `init` now generates `.stackguide/config.json` automatically.
- Added tracker service support for GitHub, GitLab, and Jira.
- Added VCS service for branch checks, commit parsing, CI status, and PR/MR creation.
- Added test runner service for structured `test`/`lint`/`build` execution.
- Updated TDD prompts to use active tool calls instead of large passive markdown payloads.
- Hardened local persistence:
  - `.stackguide` artifacts removed from version control
  - repository guard blocks accidental tracking of local artifacts
  - cache and health history include integrity validation and safer writes

## Install By IDE

### Cursor

- File (workspace): `.cursor/mcp.json`
- File (global): `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "stackguide": {
      "command": "npx",
      "args": ["-y", "@stackguide/mcp-server@latest"]
    },
    "ponytail": {
      "command": "npx",
      "args": ["-y", "@stackguide/mcp-server@latest", "stackguide-ponytail-mcp"],
      "env": {
        "PONYTAIL_DEFAULT_MODE": "lite"
      }
    }
  }
}
```

**Token tip:** Use Ponytail's `ponytail_instructions` tool or `ponytail` prompt only when you need strict YAGNI guardrails. Default mode `lite` keeps responses compact.

### JetBrains (IntelliJ, WebStorm, PhpStorm, etc.)

- Open `Settings | Tools | AI Assistant | Model Context Protocol (MCP)`.
- Click **Add** and paste JSON config.
- Recommended: set it as **Project-level** unless you want global scope.

```json
{
  "mcpServers": {
    "stackguide": {
      "command": "npx",
      "args": ["-y", "@stackguide/mcp-server@latest"]
    }
  }
}
```

### VS Code

- Requirement: GitHub Copilot Chat with MCP enabled.
- File (workspace): `.vscode/mcp.json`
- VS Code MCP schema uses `servers` as root key.

```json
{
  "servers": {
    "stackguide": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@stackguide/mcp-server@latest"]
    }
  }
}
```

### Visual Studio (Windows, 2022 17.14+ / 2026+)

- Enable GitHub Copilot Agent mode.
- Supported config locations include:
  - `%USERPROFILE%\\.mcp.json` (global)
  - `<solution>\\.mcp.json` (repo-scoped)
  - `<solution>\\.vs\\mcp.json` (solution/user-scoped)
- Visual Studio MCP schema uses `servers` as root key.

```json
{
  "servers": {
    "stackguide": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@stackguide/mcp-server@latest"]
    }
  }
}
```

## How To Use (Any IDE)

1. Restart the IDE after adding the MCP configuration.
2. Open AI chat in agent/tool mode.
3. Call `setup` to detect project context.
4. Call `init action:"full"` to scaffold `.stackguide/` and defaults.
5. Use `agent` actions (`intake`, `create_ticket`, `plan`, `verify`, `release`) for delivery flow.

## Quick Start

1. Configure your project:

```bash
setup type:"react-typescript" enableAdaptiveTdd:true model:"gpt-5" integrations:["jira","github"] tokenMode:"compact"
init action:"full" model:"gpt-5" tokenMode:"compact" integrations:["jira","github"] mcpSyncTargets:["cursor","root"] applyMcpTemplates:true
```

Ponytail is always synced as a core MCP server even when omitted from `integrations`.

1. Check generated setup:

```bash
init action:"status"
agent action:"status"
```

1. Run active TDD workflow:

```bash
agent action:"intake" ticket:"PROJ-123"
agent action:"create_ticket" mainDescription:"<MAIN DESCRIPTION>" projectKey:"PROJ"
agent action:"plan" brief:"<brief-from-intake>"
agent action:"verify"
agent action:"release" version:"v1.2.0"
```

## Tools (16)

### Core

- `setup`: configure StackGuide context for project type
- `context`: show currently loaded context
- `rules`: list/search/get/select rule sets
- `knowledge`: list/search/get knowledge files
- `review`: analyze files/URLs/project code quality

### Utility

- `cursor`: browse/import community rules
- `docs`: fetch/search/list documentation
- `config`: save/load/export/import configurations
- `custom_rule`: create/update/delete/list project custom rules
- `help`: usage help by topic

### Advanced

- `generate`: boilerplate generation (component/hook/service/test/api/model/util)
- `health`: project health score and recommendations
- `analyze`: project intelligence (structure/config/dependency/generate/apply)

### Workflow

- `workflow`: lazy-load raw workflow assets (agents/skills/hooks/commands)
- `init`: scaffold `.stackguide` with stack-aware defaults
- `agent`: active workflow executor (`status`, `intake`, `create_ticket`, `plan`, `verify`, `release`)

## Active Workflow Details

### `agent action:"intake"`

- reads ticket from configured tracker
- returns normalized brief + gaps
- proposes branch name convention
- can optionally create a Jira ticket first (`createFromDescription:true`)

### `agent action:"create_ticket"`

- creates Jira issues using strict `MAIN DESCRIPTION` format
- uses project defaults from `.stackguide/config.json` (`projectKey`, `issueType`)
- derives `summary` from first line of `MAIN DESCRIPTION` when omitted

### `agent action:"plan"`

- inspects conventions + project shape
- creates vertical-slice plan
- returns exactly 3 target tests in structured format

### `agent action:"verify"`

- executes configured tests/lint/build per layer
- checks branch naming + commit convention + TDD test budget
- returns blocker list and final pass/fail report

### `agent action:"release"`

- checks CI status
- parses commits since last tag
- suggests semver impact (`major` / `minor` / `patch`)
- can create tag and PR/MR (when enabled)

## Local Data And Security

`init` generates:

- `.stackguide/config.json` (project workflow config)

Runtime/local artifacts:

- `.stackguide/analysis-cache.json`
- `.stackguide/health-history.json`

These are machine-local and must not be committed.

### Repository Guard

`pnpm lint` includes:

```bash
pnpm run guard:repo
```

The guard fails if `.stackguide` artifacts are tracked.

### Integrity Hardening

Cache/history persistence includes:

- boundary/symlink checks
- file size and entry limits
- atomic write strategy
- checksum validation
- optional HMAC signature using:

```bash
STACKGUIDE_INTEGRITY_KEY=<long-random-secret>
```

For teams, configure `STACKGUIDE_INTEGRITY_KEY` in local/dev and CI environments for stronger tamper resistance.

## Supported Stacks

`python-django`, `python-fastapi`, `python-flask`, `react-node`, `react-typescript`, `vue-node`, `nextjs`, `express`, `nestjs`, `laravel`, `rails`, `golang`, `rust`, `custom`.

## Development

Use `pnpm` for all commands.

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
pnpm dev
```

## Release And Version Policy

- Current secure baseline: `4.1.2+`
- Versions from `3.0.0` up to `4.1.1` are deprecated in npm due to local artifact hygiene issues.
- Use the latest `4.x` release in all environments.

## Registry Identifiers

- npm package: `@stackguide/mcp-server`
- MCP Registry server: `io.github.isucorp-taimiralain/stackguide-mcp`

## License

GPL-3.0
