import { describe, expect, it } from "vitest";

import { runCli } from "../../plugins/kiro/scripts/kiro-companion.mjs";
import { buildChatArgs, getSetupReport } from "../../plugins/kiro/scripts/lib/kiro.mjs";

describe("kiro runtime", () => {
  it("builds non-interactive chat args for review and rescue", () => {
    expect(
      buildChatArgs({
        prompt: "Review this diff",
        model: "claude-sonnet-4.6",
        agent: "kiro-reviewer"
      })
    ).toEqual([
      "chat",
      "--no-interactive",
      "--trust-all-tools",
      "--model",
      "claude-sonnet-4.6",
      "--agent",
      "kiro-reviewer",
      "Review this diff"
    ]);
  });

  it("assembles setup state from version, whoami, and list-models", async () => {
    const calls = [];
    const run = async (args) => {
      calls.push(args.join(" "));

      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }

      if (args[0] === "whoami") {
        return {
          code: 0,
          stdout: "{\"username\":\"sam@example.com\",\"loggedIn\":true}\n",
          stderr: ""
        };
      }

      return {
        code: 0,
        stdout: "[\"auto\",\"claude-sonnet-4.6\"]\n",
        stderr: ""
      };
    };

    const report = await getSetupReport({ run });

    expect(calls).toEqual([
      "version",
      "whoami --format json",
      "chat --list-models --format json"
    ]);
    expect(report.ready).toBe(true);
    expect(report.models).toContain("auto");
    expect(report.whoami.username).toBe("sam@example.com");
  });

  it("treats malformed whoami and model responses as not ready", async () => {
    const run = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }

      if (args[0] === "whoami") {
        return { code: 0, stdout: "{not-json}\n", stderr: "" };
      }

      return { code: 0, stdout: "not-json\n", stderr: "" };
    };

    const report = await getSetupReport({ run });

    expect(report.ready).toBe(false);
    expect(report.loggedIn).toBe(false);
    expect(report.whoami).toBeNull();
    expect(report.models).toEqual([]);
  });

  it("treats model command failure as not ready", async () => {
    const run = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }

      if (args[0] === "whoami") {
        return {
          code: 0,
          stdout: "{\"username\":\"sam@example.com\",\"loggedIn\":true}\n",
          stderr: ""
        };
      }

      return { code: 1, stdout: "", stderr: "boom" };
    };

    const report = await getSetupReport({ run });

    expect(report.ready).toBe(false);
    expect(report.loggedIn).toBe(true);
  });
});

describe("setup command", () => {
  it("renders the setup report", async () => {
    let output = "";

    const exitCode = await runCli(["setup"], {
      write: (text) => {
        output += text;
      },
      getSetupReport: async () => ({
        ready: true,
        installed: true,
        loggedIn: true,
        version: "1.26.0",
        whoami: { username: "sam@example.com" },
        models: ["auto", "claude-sonnet-4.6"]
      }),
      renderSetupReport: (report) => `Ready: ${report.ready}\n`
    });

    expect(exitCode).toBe(0);
    expect(output).toContain("Ready: true");
  });

  it("renders setup report as json", async () => {
    let output = "";

    const exitCode = await runCli(["setup", "--json"], {
      write: (text) => {
        output += text;
      },
      getSetupReport: async () => ({
        ready: true,
        installed: true,
        loggedIn: true,
        version: "1.26.0",
        whoami: { username: "sam@example.com" },
        models: ["auto", "claude-sonnet-4.6"]
      }),
      renderSetupReport: () => "should not be used"
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      ready: true,
      version: "1.26.0",
      whoami: { username: "sam@example.com" }
    });
  });

  it("rejects leftover setup args and unknown flags", async () => {
    await expect(runCli(["setup", "extra"])).rejects.toThrow("Unknown setup argument: extra");
    await expect(runCli(["setup", "--bogus"])).rejects.toThrow("Unknown setup flag: --bogus");
  });
});
