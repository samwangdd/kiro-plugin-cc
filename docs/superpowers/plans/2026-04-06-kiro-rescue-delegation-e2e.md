# Kiro Rescue Delegation E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated test suite that proves `/kiro:rescue` delegates through `kiro-companion` in real Claude runtime, without allowing Claude to directly use repository tools during the turn.

**Architecture:** Keep product behavior unchanged and add verification around it. Use repo-local Vitest coverage for static delegation constraints, plus a dedicated real-runtime smoke suite that launches `claude -p --bare --verbose --output-format stream-json` with the local plugin and a stub `kiro-cli`, then asserts on the event stream and generated job artifacts.

**Tech Stack:** Node.js 20+, ESM `.mjs`, Vitest, Claude CLI `--plugin-dir`, Claude `stream-json` output, temp directories, shell-script stub binaries.

---

## File Map

- Modify: `package.json`
  - Add a dedicated `test:e2e-delegation` script that does not run under default `npm test`.
- Modify: `vitest.config.mjs`
  - Exclude `tests/e2e/**/*.test.mjs` from the default unit suite.
- Create: `vitest.config.e2e.mjs`
  - Include only `tests/e2e/**/*.test.mjs`.
- Modify: `tests/plugin/plugin-files.test.mjs`
  - Add assertions for the dedicated E2E script and for the exact rescue command contract.
- Create: `tests/helpers/claude-stream.mjs`
  - Parse Claude `stream-json` output and extract tool-use evidence.
- Create: `tests/helpers/claude-stream.test.mjs`
  - Unit tests for the parser and delegation evidence helpers.
- Create: `tests/helpers/claude-e2e.mjs`
  - Build a temp stub `kiro-cli`, launch Claude with the local plugin, collect artifacts, and return parsed runtime evidence.
- Create: `tests/e2e/delegation.test.mjs`
  - Real-runtime smoke test for `/kiro:rescue --fresh`.
- Modify: `README.md`
  - Document the dedicated delegation E2E command.
- Modify: `docs/README.zh-CN.md`
  - Document the dedicated delegation E2E command in Chinese.

### Task 1: Add a Dedicated E2E Test Entry Point

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.mjs`
- Create: `vitest.config.e2e.mjs`
- Test: `tests/plugin/plugin-files.test.mjs`

- [ ] **Step 1: Extend the static plugin test with the failing script expectation**

```javascript
// tests/plugin/plugin-files.test.mjs
it("publishes a dedicated delegation e2e script outside default npm test", async () => {
  const pkg = await readJson("package.json");

  expect(pkg.scripts.test).toBe("vitest run");
  expect(pkg.scripts["test:e2e-delegation"]).toBe("vitest run --config vitest.config.e2e.mjs");
});
```

- [ ] **Step 2: Run the plugin test to confirm it fails before the script exists**

Run: `npx vitest run tests/plugin/plugin-files.test.mjs`
Expected: FAIL with `expected undefined to be "vitest run --config vitest.config.e2e.mjs"`.

- [ ] **Step 3: Add the dedicated E2E script and split the Vitest configs**

```json
// package.json
{
  "scripts": {
    "plugin:bump-local": "node scripts/bump-local-plugin-version.mjs",
    "plugin:install-local": "bash scripts/install-local-marketplace.sh",
    "plugin:refresh-local": "bash scripts/refresh-local-marketplace.sh",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e-delegation": "vitest run --config vitest.config.e2e.mjs"
  }
}
```

```javascript
// vitest.config.mjs
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs"],
    exclude: ["tests/e2e/**/*.test.mjs"]
  }
});
```

```javascript
// vitest.config.e2e.mjs
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.mjs"]
  }
});
```

- [ ] **Step 4: Re-run the static test to verify the entry point is wired correctly**

Run: `npx vitest run tests/plugin/plugin-files.test.mjs`
Expected: PASS with the new script assertion green.

- [ ] **Step 5: Commit the entry-point split**

```bash
git add package.json vitest.config.mjs vitest.config.e2e.mjs tests/plugin/plugin-files.test.mjs
git commit -m "test: add dedicated delegation e2e entrypoint"
```

### Task 2: Add Stream-JSON Parsing Helpers for Delegation Evidence

**Files:**
- Create: `tests/helpers/claude-stream.mjs`
- Create: `tests/helpers/claude-stream.test.mjs`

- [ ] **Step 1: Write failing parser tests for tool-use extraction**

```javascript
// tests/helpers/claude-stream.test.mjs
import { describe, expect, it } from "vitest";

import {
  collectToolUses,
  findForbiddenToolUses,
  findKeyBashCommands,
  parseClaudeStream
} from "./claude-stream.mjs";

describe("claude stream helpers", () => {
  it("parses newline-delimited Claude events", () => {
    const streamText = [
      JSON.stringify({ type: "system", subtype: "init", slash_commands: ["kiro:rescue"] }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "node \"/tmp/kiro-companion.mjs\" rescue --fresh smoke task" }
            }
          ]
        }
      }),
      JSON.stringify({ type: "result", result: "RESCUE_SENTINEL: delegated via stub" })
    ].join("\n");

    const events = parseClaudeStream(streamText);

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("system");
    expect(events[2].type).toBe("result");
  });

  it("extracts exactly one key Bash command and no forbidden tools", () => {
    const events = parseClaudeStream([
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "node \"/tmp/kiro-companion.mjs\" rescue --fresh smoke task" }
            }
          ]
        }
      })
    ].join("\n"));

    expect(collectToolUses(events)).toHaveLength(1);
    expect(findKeyBashCommands(events)).toEqual([
      'node "/tmp/kiro-companion.mjs" rescue --fresh smoke task'
    ]);
    expect(findForbiddenToolUses(events, ["Read", "Edit", "Grep"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the helper test to confirm it fails before the helper exists**

Run: `npx vitest run tests/helpers/claude-stream.test.mjs`
Expected: FAIL with `Cannot find module './claude-stream.mjs'`.

- [ ] **Step 3: Implement the stream parser and evidence helpers**

```javascript
// tests/helpers/claude-stream.mjs
export function parseClaudeStream(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function collectToolUses(events) {
  return events.flatMap((event) => {
    const content = event?.message?.content;
    if (!Array.isArray(content)) {
      return [];
    }
    return content
      .filter((item) => item?.type === "tool_use")
      .map((item) => ({
        eventType: event.type,
        name: item.name,
        input: item.input || {}
      }));
  });
}

export function findForbiddenToolUses(events, forbiddenNames) {
  const forbidden = new Set(forbiddenNames);
  return collectToolUses(events).filter((item) => forbidden.has(item.name));
}

export function findKeyBashCommands(events) {
  return collectToolUses(events)
    .filter((item) => item.name === "Bash")
    .map((item) => item.input.command)
    .filter((command) => typeof command === "string" && command.includes("kiro-companion.mjs"))
    .filter((command) => command.includes(" rescue "));
}
```

- [ ] **Step 4: Run the helper test again to verify parser behavior**

Run: `npx vitest run tests/helpers/claude-stream.test.mjs`
Expected: PASS with 2 tests passing.

- [ ] **Step 5: Commit the parser helpers**

```bash
git add tests/helpers/claude-stream.mjs tests/helpers/claude-stream.test.mjs
git commit -m "test: add claude stream delegation helpers"
```

### Task 3: Add the Real-Runtime Delegation Smoke Test

**Files:**
- Create: `tests/helpers/claude-e2e.mjs`
- Create: `tests/e2e/delegation.test.mjs`
- Test: `tests/e2e/delegation.test.mjs`

- [ ] **Step 1: Write the failing real-runtime smoke test**

```javascript
// tests/e2e/delegation.test.mjs
import { describe, expect, it } from "vitest";

import { findForbiddenToolUses, findKeyBashCommands } from "../helpers/claude-stream.mjs";
import { runDelegationSmoke } from "../helpers/claude-e2e.mjs";

describe("kiro rescue delegation", () => {
  it("delegates through kiro-companion without direct repository tools", async () => {
    const sentinel = "RESCUE_SENTINEL: delegated via stub";
    const result = await runDelegationSmoke({
      pluginDir: "plugins/kiro",
      taskText: "smoke task",
      sentinel
    });

    expect(result.init?.slash_commands).toContain("kiro:rescue");
    expect(findKeyBashCommands(result.events)).toHaveLength(1);
    expect(findKeyBashCommands(result.events)[0]).toContain("kiro-companion.mjs");
    expect(findKeyBashCommands(result.events)[0]).toContain(" rescue --fresh smoke task");
    expect(findForbiddenToolUses(result.events, ["Read", "Edit", "Grep"])).toEqual([]);
    expect(result.finalResult).toContain(sentinel);
    expect(result.state.jobs[result.jobId].summary).toContain(sentinel);
    expect(result.logText).toContain(sentinel);
    expect(result.handoffText).toContain(sentinel);
  }, 30000);
});
```

- [ ] **Step 2: Run the dedicated E2E command to confirm the new smoke test fails**

Run: `npm run test:e2e-delegation`
Expected: FAIL with `Cannot find module '../helpers/claude-e2e.mjs'`.

- [ ] **Step 3: Implement the real-runtime launcher with a stub `kiro-cli`**

```javascript
// tests/helpers/claude-e2e.mjs
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, chmod, readdir } from "node:fs/promises";

import { parseClaudeStream } from "./claude-stream.mjs";

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function makeTempDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createStubKiroCli(binDir, sentinel) {
  const filePath = path.join(binDir, "kiro-cli");
  const script = [
    "#!/bin/sh",
    "cmd=\"$1\"",
    "shift || true",
    "case \"$cmd\" in",
    `  chat) printf "${sentinel}\\n" ;;`,
    "  version) printf \"kiro-cli 0.0-test\\n\" ;;",
    "  whoami) printf '{\"username\":\"stub-user\"}\\n' ;;",
    "  login) exit 0 ;;",
    "  *) printf \"unexpected:%s\\n\" \"$cmd\" >&2; exit 1 ;;",
    "esac"
  ].join("\n");

  await writeFile(filePath, `${script}\n`, "utf8");
  await chmod(filePath, 0o755);
  return filePath;
}

export async function runDelegationSmoke({ pluginDir, taskText, sentinel }) {
  const rootDir = process.cwd();
  const tempBin = await makeTempDir("kiro-e2e-bin-");
  const projectDir = await makeTempDir("kiro-e2e-project-");
  const homeDir = await makeTempDir("kiro-e2e-home-");

  try {
    await createStubKiroCli(tempBin, sentinel);

    const command = process.env.CLAUDE_BIN || "claude";
    const args = [
      "-p",
      "--bare",
      "--verbose",
      "--permission-mode",
      "dontAsk",
      "--plugin-dir",
      path.resolve(rootDir, pluginDir),
      "--output-format",
      "stream-json",
      `/kiro:rescue --fresh ${taskText}`
    ];

    const run = await runProcess(command, args, {
      cwd: projectDir,
      env: {
        ...process.env,
        CLAUDE_CODE_SIMPLE: "1",
        KIRO_COMPANION_HOME: homeDir,
        PATH: `${tempBin}${path.delimiter}${process.env.PATH || ""}`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (run.code !== 0) {
      throw new Error(`Claude smoke run failed: ${run.stderr || run.stdout}`);
    }

    const events = parseClaudeStream(run.stdout);
    const init = events.find((event) => event.type === "system" && event.subtype === "init") || null;
    const resultEvent = events.find((event) => event.type === "result") || null;
    const jobsDir = path.join(homeDir, "jobs");
    const jobFiles = (await readdir(jobsDir)).filter((name) => name.endsWith(".meta.json"));
    const metaPath = path.join(jobsDir, jobFiles[0]);
    const jobMeta = JSON.parse(await readFile(metaPath, "utf8"));
    const state = JSON.parse(await readFile(path.join(homeDir, "state.json"), "utf8"));
    const logText = await readFile(jobMeta.logPath, "utf8");
    const handoffText = await readFile(path.join(projectDir, ".kiro-companion", "handoff.md"), "utf8");

    return {
      events,
      init,
      finalResult: resultEvent?.result || "",
      jobId: jobMeta.id,
      jobMeta,
      state,
      logText,
      handoffText
    };
  } finally {
    await rm(tempBin, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run the dedicated smoke suite to verify the delegation assertions pass**

Run: `npm run test:e2e-delegation`
Expected: PASS with `tests/e2e/delegation.test.mjs` green and no unit-test files included.

- [ ] **Step 5: Commit the real-runtime smoke coverage**

```bash
git add tests/helpers/claude-e2e.mjs tests/e2e/delegation.test.mjs
git commit -m "test: add kiro rescue delegation smoke coverage"
```

### Task 4: Tighten Static Contract Assertions for the Rescue Command

**Files:**
- Modify: `tests/plugin/plugin-files.test.mjs`
- Test: `tests/plugin/plugin-files.test.mjs`

- [ ] **Step 1: Add failing assertions for the exact no-follow-up contract**

```javascript
// tests/plugin/plugin-files.test.mjs
expect(rescue).toContain("allowed-tools: Bash(node:*)");
expect(rescue).toContain("Return the command stdout verbatim.");
expect(rescue).toContain("Do not paraphrase or do follow-up work in the same turn.");
```

- [ ] **Step 2: Run the plugin contract test to verify the exact contract assertions**

Run: `npx vitest run tests/plugin/plugin-files.test.mjs`
Expected: PASS with the new assertions green. If it fails, the rescue command file does not match the required contract yet.

- [ ] **Step 3: Set `plugins/kiro/commands/rescue.md` to the exact contract text below**

````markdown
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
````

- [ ] **Step 4: Re-run the plugin contract test to confirm the exact rescue contract**

Run: `npx vitest run tests/plugin/plugin-files.test.mjs`
Expected: PASS with the new assertions green.

- [ ] **Step 5: Commit the static contract tightening**

```bash
git add tests/plugin/plugin-files.test.mjs plugins/kiro/commands/rescue.md
git commit -m "test: lock rescue command delegation contract"
```

### Task 5: Document the Dedicated Delegation Smoke Command

**Files:**
- Modify: `README.md`
- Modify: `docs/README.zh-CN.md`

- [ ] **Step 1: Add the failing documentation check**

Run: `rg -n "test:e2e-delegation" README.md docs/README.zh-CN.md`
Expected: FAIL with exit code `1` before the docs mention the new script.

- [ ] **Step 2: Document the dedicated command in the English README**

````markdown
## Development

```bash
npm install
npm test
npm run test:e2e-delegation
```

`npm run test:e2e-delegation` launches a real Claude CLI session with the local plugin and a stub `kiro-cli` to verify `/kiro:rescue` delegates through `kiro-companion` without direct repository tool use.
````

- [ ] **Step 3: Document the dedicated command in the Chinese README**

````markdown
## 开发

```bash
npm install
npm test
npm run test:e2e-delegation
```

`npm run test:e2e-delegation` 会启动真实的 Claude CLI、本地 `kiro` 插件和一个 stub `kiro-cli`，用来验证 `/kiro:rescue` 是否确实通过 `kiro-companion` 完成委派，而不是由 Claude 直接使用仓库工具执行任务。
````

- [ ] **Step 4: Re-run the documentation check**

Run: `rg -n "test:e2e-delegation" README.md docs/README.zh-CN.md`
Expected: PASS with one match in each file.

- [ ] **Step 5: Commit the documentation updates**

```bash
git add README.md docs/README.zh-CN.md
git commit -m "docs: document delegation e2e smoke command"
```

## Final Verification

- [ ] Run: `npm test`
Expected: PASS with unit and static tests green, without running `tests/e2e`.

- [ ] Run: `npm run test:e2e-delegation`
Expected: PASS with the real-runtime smoke test green.

- [ ] Run: `git status --short`
Expected: clean working tree.
