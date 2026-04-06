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
              input: { command: 'node "/tmp/kiro-companion.mjs" rescue --fresh smoke task' }
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

  it("finds forbidden tool uses when they are present", () => {
    const events = parseClaudeStream([
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/tmp/review.md" }
            }
          ]
        }
      })
    ].join("\n"));

    expect(findForbiddenToolUses(events, ["Read", "Edit", "Grep"])).toEqual([
      {
        eventType: "assistant",
        name: "Read",
        input: { file_path: "/tmp/review.md" }
      }
    ]);
  });

  it("extracts the rescue Bash command and filters out non-matching Bash commands", () => {
    const events = parseClaudeStream([
      JSON.stringify({
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
              input: { command: "npm test" }
            }
          ]
        }
      })
    ].join("\n"));

    expect(collectToolUses(events)).toHaveLength(2);
    expect(findKeyBashCommands(events)).toEqual([
      'node "/tmp/kiro-companion.mjs" rescue --fresh smoke task'
    ]);
    expect(findForbiddenToolUses(events, ["Read", "Edit", "Grep"])).toEqual([]);
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
              input: { command: 'node "/tmp/kiro-companion.mjs" rescue --fresh smoke task' }
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

  it("reports the failing line number and snippet when JSON parsing fails", () => {
    expect(() => parseClaudeStream('{"type":"system"}\nnot-json')).toThrow(
      /line 2: not-json/
    );
  });
});
