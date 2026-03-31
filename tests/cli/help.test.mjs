import { describe, expect, it } from "vitest";

import { runCli } from "../../plugins/kiro/scripts/kiro-companion.mjs";

describe("kiro-companion usage", () => {
  it("prints usage when no command is provided", async () => {
    let output = "";
    const exitCode = await runCli([], {
      write: (text) => {
        output += text;
      }
    });

    expect(exitCode).toBe(0);
    expect(output).toContain("Usage:");
    expect(output).toContain("review");
    expect(output).toContain("rescue");
  });
});
