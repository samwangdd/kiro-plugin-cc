---
description: Run a Kiro code review against local git changes
argument-hint: '[--base <ref>] [--wait|--background]'
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" review $ARGUMENTS
```

Return the command stdout verbatim. Do not paraphrase or fix issues in the same turn.
