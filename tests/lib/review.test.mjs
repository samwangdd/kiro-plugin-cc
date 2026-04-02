import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { withTempProject } from "../helpers/temp-env.mjs";
import { runCli } from "../../plugins/kiro/scripts/kiro-companion.mjs";
import { collectReviewContext } from "../../plugins/kiro/scripts/lib/git.mjs";

const execFileAsync = promisify(execFile);

async function initGitRepo(projectRoot) {
  await execFileAsync("git", ["init"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: projectRoot });
}

describe("review context", () => {
  it("captures working-tree diff plus untracked files", async () => {
    await withTempProject(async (projectRoot) => {
      await initGitRepo(projectRoot);
      await writeFile(path.join(projectRoot, "app.js"), "export const value = 1;\n");
      await execFileAsync("git", ["add", "app.js"], { cwd: projectRoot });
      await execFileAsync("git", ["commit", "-m", "init"], { cwd: projectRoot });
      await writeFile(path.join(projectRoot, "app.js"), "export const value = 2;\n");
      await writeFile(path.join(projectRoot, "notes.md"), "# scratch\n");

      const context = await collectReviewContext({ cwd: projectRoot });
      expect(context.target.label).toBe("working tree");
      expect(context.content).toContain("-export const value = 1;");
      expect(context.content).toContain("notes.md");
    });
  });
});

describe("review command", () => {
  it("renders validated structured review output", async () => {
    let output = "";
    const fakeSchema = {
      type: "object",
      required: ["summary", "verdict", "findings"],
      properties: {
        summary: { type: "string" },
        verdict: { type: "string" },
        findings: { type: "array" }
      }
    };
    const exitCode = await runCli(["review"], {
      write: (text) => { output += text; },
      collectReviewContext: async () => ({
        target: { label: "working tree" },
        content: "diff --git a/app.js b/app.js"
      }),
      readHandoffText: async () => "# Handoff\n",
      loadReviewAssets: async () => ({ template: "tmpl", schema: fakeSchema }),
      buildReviewPrompt: () => "prompt",
      runReviewChat: async () => ({
        stdout: JSON.stringify({
          summary: "One issue found",
          verdict: "needs_changes",
          findings: [
            {
              severity: "high",
              file: "app.js",
              line: 1,
              title: "Broken logic",
              details: "The change reverses the original condition."
            }
          ]
        })
      }),
      parseReviewOutput: (stdout) => JSON.parse(stdout),
      renderReviewReport: (payload) => `${payload.summary}\n`
    });

    expect(exitCode).toBe(0);
    expect(output).toContain("One issue found");
  });
});
