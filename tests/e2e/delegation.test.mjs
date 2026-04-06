import { describe, expect, it } from "vitest";

import { findForbiddenToolUses, findKeyBashCommands } from "../helpers/claude-stream.mjs";
import { runDelegationSmoke, sliceCurrentTurnEvents } from "../helpers/claude-e2e.mjs";

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
    expect(result.resultEvent?.result).toContain(sentinel);
    expect(result.finalResult).toContain(sentinel);
    expect(result.state.jobs[result.jobId].summary).toContain(sentinel);
    expect(result.logText).toContain(sentinel);
    expect(result.handoffText).toContain(sentinel);
  }, 30000);
});
