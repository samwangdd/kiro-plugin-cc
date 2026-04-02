# Kiro Plugin for Claude Code

[中文文档](docs/README.zh-CN.md)

Use [Kiro](https://kiro.dev) inside Claude Code for code reviews and task delegation.

Inspired by [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc). 

## Prerequisites

- [Kiro CLI](https://kiro.dev) installed and authenticated
- Node.js >= 20.11

## Install

```bash
/plugin marketplace add samwangdd/kiro-plugin-cc
/plugin install kiro@samwangdd-kiro
```

## Commands

| Command | Description |
|---------|-------------|
| `/kiro:setup` | Set up the plugin |
| `/kiro:review` | Code review on local changes |
| `/kiro:rescue` | Delegate a task to Kiro |
| `/kiro:status` | Show running jobs |
| `/kiro:result` | Show output of a finished job |
| `/kiro:cancel` | Cancel a background job |
| `/kiro:setup` | Check environment readiness |

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
