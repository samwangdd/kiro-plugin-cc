import { describe, expect, it } from "vitest";

import { collectToolUses, findForbiddenToolUses, findKeyBashCommands } from "../helpers/claude-stream.mjs";
import { runDelegationSmoke, selectCurrentTurn, sliceCurrentTurnEvents } from "../helpers/claude-e2e.mjs";

describe("kiro rescue delegation", () => {
  it("keeps the full prompted turn instead of starting at the rescue Bash tool", () => {
    const events = [
      { type: "system", subtype: "init", slash_commands: ["kiro:rescue"] },
      { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/tmp/file" } }] } },
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: 'node "/tmp/kiro-companion.mjs" rescue --fresh smoke task' }
            }
          ]
        }
      },
      { type: "result", result: "RESCUE_SENTINEL: delegated via stub" }
    ];

    expect(sliceCurrentTurnEvents(events)).toEqual(events.slice(1));
  });

  it("derives init from the same current-turn boundary and excludes prior-turn Bash calls", () => {
    const priorInit = { type: "system", subtype: "init", slash_commands: ["other:cmd"] };
    const currentInit = { type: "system", subtype: "init", slash_commands: ["kiro:rescue"] };
    const events = [
      priorInit,
      {
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pwd" } }] }
      },
      currentInit,
      {
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/tmp/file" } }] }
      },
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: 'node "/tmp/kiro-companion.mjs" rescue --fresh smoke task' }
            },
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "git status" }
            }
          ]
        }
      },
      { type: "result", result: "RESCUE_SENTINEL: delegated via stub" }
    ];

    const currentTurn = selectCurrentTurn(events);
    const bashCommands = collectToolUses(currentTurn.events)
      .filter((item) => item.name === "Bash")
      .map((item) => item.input.command);

    expect(currentTurn.init).toEqual(currentInit);
    expect(currentTurn.events).toEqual(events.slice(3));
    expect(bashCommands).toEqual([
      'node "/tmp/kiro-companion.mjs" rescue --fresh smoke task',
      "git status"
    ]);
  });

  it("delegates through kiro-companion without direct repository tools", async () => {
    const sentinel = "RESCUE_SENTINEL: delegated via stub";
    const result = await runDelegationSmoke({
      pluginDir: "plugins/kiro",
      taskText: "smoke task",
      sentinel
    });
    const bashCommands = collectToolUses(result.events)
      .filter((item) => item.name === "Bash")
      .map((item) => item.input.command);

    expect(result.init?.slash_commands).toContain("kiro:rescue");
    expect(bashCommands).toHaveLength(1);
    expect(findKeyBashCommands(result.events)).toHaveLength(1);
    expect(findKeyBashCommands(result.events)[0]).toContain("kiro-companion.mjs");
    expect(findKeyBashCommands(result.events)[0]).toContain(" rescue --fresh smoke task");
    expect(findForbiddenToolUses(result.events, ["Read", "Edit", "Grep"])).toEqual([]);
    expect(result.resultEvent?.result).toContain(sentinel);
    expect(result.finalResult).toContain(sentinel);
    expect(result.state.jobs[result.jobId].summary).toContain(sentinel);
    expect(result.logText).toContain(sentinel);
    expect(result.handoffText).toContain(sentinel);
  }, 30000);
});
