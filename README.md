# Kiro Plugin for Claude Code

[中文文档](docs/README.zh-CN.md)

Use [Kiro](https://kiro.dev) inside Claude Code for code reviews and direct task delegation through `kiro-cli`.

Inspired by [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc). 

## Prerequisites

- [Kiro CLI](https://kiro.dev) installed and authenticated
- Node.js >= 20.11

## Install

```bash
/plugin marketplace add samwangdd/kiro-plugin-cc
/plugin install kiro@samwangdd-kiro
```

## Local Development Install

Use this when developing the plugin from this local checkout and you want the commands to be available in Claude Code across repositories.

### 1. Install the local marketplace copy

```bash
npm run plugin:install-local
```

### 2. Reload plugins in Claude Code

```bash
/reload-plugins
/kiro:setup
```

### 3. Use the commands in any repo

```bash
/kiro:review
/kiro:rescue investigate why tests are failing
/kiro:rescue --background fix the login bug
```

### 4. After changing plugin code in this repo

Refresh the cached local install, then reload plugins in Claude Code:

```bash
npm run plugin:refresh-local
```

This command now bumps the plugin patch version automatically before refreshing the local marketplace cache. If you only want to bump the local plugin version without refreshing, run:

```bash
npm run plugin:bump-local
```

```bash
/reload-plugins
/kiro:setup
```

The refresh script auto-detects the configured local marketplace name for this checkout, so it works even if the marketplace was added under a custom name such as `kiro-companion`.

## Commands

| Command | Description |
|---------|-------------|
| `/kiro:setup` | Check environment readiness |
| `/kiro:review` | Code review on local changes |
| `/kiro:rescue` | Run a rescue task directly through the local `kiro-cli` runtime |
| `/kiro:status` | Show running jobs |
| `/kiro:result` | Show output of a finished job |
| `/kiro:cancel` | Cancel a background job |

## Quick Start

```bash
/kiro:review
/kiro:rescue investigate why tests are failing
/kiro:rescue --background fix the login bug
/kiro:status
/kiro:result
```

## Development

```bash
npm install
npm test
```

## License

Apache-2.0
