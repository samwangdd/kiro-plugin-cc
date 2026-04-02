---
name: kiro-cli-runtime
description: Forward rescue work into the shared kiro companion runtime with a single Bash invocation
user-invocable: false
---

Use this skill only inside the `kiro:kiro-rescue` subagent.

Primary helper:
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue ...`

Execution rules:

- The rescue subagent is a forwarder, not an orchestrator. Its only job is to invoke `rescue` once and return that stdout unchanged.
- Prefer the helper over hand-rolled `git`, direct kiro-cli strings, or any other Bash activity.
- Do not call `setup`, `review`, `status`, `result`, or `cancel` from `kiro:kiro-rescue`.
- Use `rescue` for every rescue request.

Safety rules:

- Do not inspect the repository, read files, grep, glob, or monitor progress.
- Do not summarize output or do any follow-up work of your own.
- Return the stdout of the kiro-companion command exactly as-is.
- If the Bash call fails or kiro-cli cannot be invoked, return nothing.

Command selection:

- Use exactly one `rescue` invocation per rescue handoff.
- Treat `--background`, `--wait`, `--resume`, `--fresh`, `--model`, and `--agent` as routing flags. Do not include them in the task text.
- Preserve the user's task text as-is apart from stripping routing flags.
