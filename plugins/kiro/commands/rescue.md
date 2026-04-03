---
description: Delegate a rescue task directly to the local Kiro CLI runtime
argument-hint: '[--background|--wait] [--resume|--fresh] [--model <model>] [--agent <agent>] [task]'
context: fork
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue $ARGUMENTS
```

Return the command stdout verbatim. Do not paraphrase or do follow-up work in the same turn.
