# Kiro Companion for Claude Code

Kiro Companion lets Claude Code run `kiro-cli` for:

- `/kiro:review`
- `/kiro:rescue`
- `/kiro:setup`
- `/kiro:status`
- `/kiro:result`
- `/kiro:cancel`

## Development

```bash
npm install
npm test
```

## Local plugin install

1. Install the repository as a local Claude Code plugin.
2. Run `/kiro:setup`.
3. Start with `/kiro:review` or `/kiro:rescue`.

## Runtime files

- Global state: `~/.kiro-companion/`
- Project handoff: `.kiro-companion/handoff.md`
