import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { runCli } from "../../plugins/kiro/scripts/kiro-companion.mjs";

const execFileAsync = promisify(execFile);
const cliScriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../plugins/kiro/scripts/kiro-companion.mjs"
);

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

  it("rejects unknown commands", async () => {
    await expect(runCli(["bad"])).rejects.toThrow("Unknown command: bad");
  });

  it("prints usage and exits cleanly when executed directly without args", async () => {
    const result = await execFileAsync(process.execPath, [
      cliScriptPath
    ]);

    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("review");
    expect(result.stdout).toContain("rescue");
    expect(result.stderr).toBe("");
  });

  it("writes an error and exits non-zero when executed directly with an unknown command", async () => {
    await expect(
      execFileAsync(process.execPath, [cliScriptPath, "bad"])
    ).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: "Unknown command: bad\n"
    });
  });
});
