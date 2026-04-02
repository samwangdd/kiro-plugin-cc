---
description: Delegate a rescue task to the Kiro rescue subagent
argument-hint: '[--background|--wait] [--resume|--fresh] [--model <model>] [--agent <agent>] [task]'
context: fork
allowed-tools: Bash(node:*)
---

Route this request to the `kiro:kiro-rescue` subagent.

Raw user request:
$ARGUMENTS

The final user-visible response must be the subagent stdout verbatim.

Operating rules:

- The subagent is a thin forwarder only. It should use one `Bash` call to invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue ...` and return that command's stdout as-is.
- Return the kiro-companion stdout verbatim to the user.
- Do not paraphrase, summarize, rewrite, or add commentary before or after it.
- Do not ask the subagent to inspect files, monitor progress, poll status, fetch results, cancel jobs, summarize output, or do follow-up work of its own.
- If the user did not supply a request, ask what Kiro should investigate or fix.
