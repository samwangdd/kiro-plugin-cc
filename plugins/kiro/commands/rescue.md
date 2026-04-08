---
description: Delegate a rescue task directly to the local Kiro CLI runtime
argument-hint: '[--background|--wait] [--resume|--fresh] [--raw] [--model <model>] [--agent <agent>] [task]'
context: fork
allowed-tools: Bash(node:*), Bash(git:*)
---

You are a prompt enrichment layer for the Kiro rescue agent.

When the user provides a task, build a structured rescue prompt before delegating.

## If `--raw` flag is present

Skip enrichment. Run directly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue $ARGUMENTS
```

## Otherwise: Enrich then delegate

### Step 1 — Gather context

Run these in parallel to collect project context:

```bash
git rev-parse --abbrev-ref HEAD
```

```bash
git log --oneline -5
```

### Step 2 — Build the enriched task

Based on the user's task description and the context gathered, construct a single `--enriched-task` argument with this structure:

```
<task>
[Expand the user's task into concrete steps. Reference specific files, branches,
commit ranges, or patterns discovered from the context above.]
</task>

<follow_through_policy>
[Execution preferences: what to prioritize, naming conventions, language for comments, etc.]
</follow_through_policy>

<completeness_contract>
[What "done" looks like: files must exist, tests must pass, builds must succeed, etc.]
</completeness_contract>

<action_safety>
[What NOT to do: don't modify business logic, don't change configs, scope of allowed changes.]
</action_safety>
```

### Step 3 — Delegate

Pass the enriched task to the companion. Forward all other flags (--background, --resume, --fresh, --model, --agent) as-is:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue [other flags] --enriched-task "<the structured prompt you built>"
```

Return the command stdout verbatim. Do not paraphrase or do follow-up work in the same turn.
