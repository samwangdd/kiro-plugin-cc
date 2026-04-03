---
description: Show active (running/pending) Kiro companion tasks
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" tasks $ARGUMENTS
```

Return stdout verbatim.
