# Kiro Rescue Direct Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/kiro:rescue` execute `kiro-companion` directly so Claude Code does not route rescue work through a Claude subagent.

**Architecture:** Move rescue routing to the slash-command layer, matching the direct-execution pattern already used by `/kiro:setup` and `/kiro:review`. Simplify foreground rescue success handling so it trusts the actual `kiro-cli` result instead of inferring success from job metadata growth.

**Tech Stack:** Claude Code plugin markdown commands, Node.js companion runtime, Vitest

---

### Task 1: Lock in Direct Rescue Command Behavior

**Files:**
- Modify: `tests/plugin/plugin-files.test.mjs`
- Modify: `plugins/kiro/commands/rescue.md`

- [ ] **Step 1: Write the failing test**

```js
expect(rescue).toContain('disable-model-invocation: true');
expect(rescue).toContain('node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue');
expect(rescue).not.toContain("kiro:kiro-rescue");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/plugin/plugin-files.test.mjs`
Expected: FAIL because `plugins/kiro/commands/rescue.md` still routes to `kiro:kiro-rescue`.

- [ ] **Step 3: Write minimal implementation**

```md
---
description: Delegate a rescue task directly to the local Kiro CLI runtime
argument-hint: '[--background|--wait] [--resume|--fresh] [--model <model>] [--agent <agent>] [task]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue $ARGUMENTS
```

Return the command stdout verbatim. Do not paraphrase or do follow-up work in the same turn.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/plugin/plugin-files.test.mjs`
Expected: PASS

### Task 2: Remove Foreground Rescue False Failure

**Files:**
- Modify: `tests/cli/commands.test.mjs`
- Modify: `plugins/kiro/scripts/kiro-companion.mjs`

- [ ] **Step 1: Write the failing test**

```js
const exitCode = await runCli(["rescue", "Fix the flaky test"], {
  write: (text) => { output += text; },
  readHandoff: async () => ({ completed: [], current: [], findings: [] }),
  readHandoffText: async () => "handoff",
  buildRescuePrompt: ({ taskText }) => taskText,
  runRescueChat: async () => ({ stdout: "fixed\n", stderr: "", code: 0 }),
  writeHandoff: async () => ({})
});

expect(exitCode).toBe(0);
expect(output).toBe("fixed\n");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli/commands.test.mjs`
Expected: FAIL because foreground rescue still depends on job count growth and emits the warning path.

- [ ] **Step 3: Write minimal implementation**

```js
if (command === "rescue" && !asBackground) {
  const result = await executeRescueJob(options, deps);
  deps.write(result.stdout);
  return result.code === 0 ? 0 : 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli/commands.test.mjs`
Expected: PASS

### Task 3: Verify the End State

**Files:**
- Verify: `tests/plugin/plugin-files.test.mjs`
- Verify: `tests/cli/commands.test.mjs`

- [ ] **Step 1: Run focused verification**

Run: `npm test -- tests/plugin/plugin-files.test.mjs tests/cli/commands.test.mjs`
Expected: PASS

- [ ] **Step 2: Sanity-check changed files**

Run: `git diff -- plugins/kiro/commands/rescue.md plugins/kiro/scripts/kiro-companion.mjs tests/plugin/plugin-files.test.mjs tests/cli/commands.test.mjs`
Expected: Rescue command is direct-execution only, foreground rescue warning path is removed, tests reflect the new contract.
