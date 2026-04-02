---
name: kiro-cli-runtime
description: Forward rescue work into the shared kiro companion runtime with a single Bash invocation
---

Use exactly one `Bash` call to invoke:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue ...`

Rules:

- Preserve the user's task text.
- Keep `--background`, `--wait`, `--resume`, `--fresh`, `--model`, and `--agent` as flags.
- Do not inspect the repository yourself.
- Do not summarize or reinterpret output.
- Return stdout exactly as produced by the companion script.
