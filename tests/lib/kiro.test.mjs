import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { runCli } from "../../plugins/kiro/scripts/kiro-companion.mjs";
import { buildChatArgs, getSetupReport, login, runKiro } from "../../plugins/kiro/scripts/lib/kiro.mjs";

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

  it("builds resume chat args", () => {
    expect(
      buildChatArgs({
        prompt: "Continue the rescue",
        model: "claude-sonnet-4.6",
        agent: "kiro-rescuer",
        resume: true
      })
    ).toEqual([
      "chat",
      "--resume",
      "--model",
      "claude-sonnet-4.6",
      "--agent",
      "kiro-rescuer",
      "Continue the rescue"
    ]);
  });

  it("resolves runKiro success and timeout paths", async () => {
    const successfulChild = new EventEmitter();
    successfulChild.stdout = new EventEmitter();
    successfulChild.stderr = new EventEmitter();
    successfulChild.kill = () => true;

    const success = runKiro(["version"], {
      spawnImpl: () => {
        queueMicrotask(() => {
          successfulChild.stdout.emit("data", Buffer.from("1.26.0\n"));
          successfulChild.emit("close", 0);
        });

        return successfulChild;
      }
    });

    await expect(success).resolves.toEqual({
      code: 0,
      stdout: "1.26.0\n",
      stderr: ""
    });

    const timeoutChild = new EventEmitter();
    timeoutChild.stdout = new EventEmitter();
    timeoutChild.stderr = new EventEmitter();
    timeoutChild.kill = () => true;

    await expect(
      runKiro(["version"], {
        spawnImpl: () => timeoutChild,
        timeoutMs: 1
      })
    ).rejects.toThrow("kiro-cli timed out after 1ms");
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

  it("rejects blank usernames and invalid model payloads", async () => {
    const blankUsernameRun = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }

      if (args[0] === "whoami") {
        return {
          code: 0,
          stdout: "{\"username\":\"   \",\"loggedIn\":true}\n",
          stderr: ""
        };
      }

      return { code: 0, stdout: "[\"auto\"]\n", stderr: "" };
    };

    const missingUsernameRun = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }

      if (args[0] === "whoami") {
        return {
          code: 0,
          stdout: "{\"loggedIn\":true}\n",
          stderr: ""
        };
      }

      return { code: 0, stdout: "[\"auto\"]\n", stderr: "" };
    };

    const emptyModelsRun = async (args) => {
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

      return { code: 0, stdout: "[]\n", stderr: "" };
    };

    const badModelEntriesRun = async (args) => {
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

      return { code: 0, stdout: "[\"auto\",\"\"]\n", stderr: "" };
    };

    await expect(getSetupReport({ run: blankUsernameRun })).resolves.toMatchObject({
      ready: false,
      loggedIn: false,
      whoami: null
    });

    await expect(getSetupReport({ run: missingUsernameRun })).resolves.toMatchObject({
      ready: false,
      loggedIn: false,
      whoami: null
    });

    await expect(getSetupReport({ run: emptyModelsRun })).resolves.toMatchObject({
      ready: false,
      loggedIn: true,
      models: []
    });

    await expect(getSetupReport({ run: badModelEntriesRun })).resolves.toMatchObject({
      ready: false,
      loggedIn: true,
      models: []
    });
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

describe("login", () => {
  it("spawns kiro-cli login with inherited stdio", async () => {
    const child = new EventEmitter();
    let spawnedArgs;
    let spawnedOpts;

    const result = login({
      spawnImpl: (cmd, args, opts) => {
        spawnedArgs = args;
        spawnedOpts = opts;
        queueMicrotask(() => child.emit("close", 0));
        return child;
      }
    });

    await expect(result).resolves.toEqual({ code: 0 });
    expect(spawnedArgs).toEqual(["login"]);
    expect(spawnedOpts.stdio).toBe("inherit");
  });

  it("returns non-zero code on login failure", async () => {
    const child = new EventEmitter();

    const result = login({
      spawnImpl: () => {
        queueMicrotask(() => child.emit("close", 1));
        return child;
      }
    });

    await expect(result).resolves.toEqual({ code: 1 });
  });
});

describe("auto-login in getSetupReport", () => {
  it("calls loginFn and re-checks whoami when autoLogin is true and not logged in", async () => {
    let loginCalled = false;
    let whoamiCallCount = 0;

    const run = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }
      if (args[0] === "whoami") {
        whoamiCallCount++;
        // First call: not logged in; second call (after login): logged in
        if (whoamiCallCount === 1) {
          return { code: 1, stdout: "", stderr: "" };
        }
        return {
          code: 0,
          stdout: '{"username":"sam@example.com"}\n',
          stderr: ""
        };
      }
      return { code: 0, stdout: '["auto"]\n', stderr: "" };
    };

    const report = await getSetupReport({
      run,
      autoLogin: true,
      loginFn: async () => {
        loginCalled = true;
        return { code: 0 };
      }
    });

    expect(loginCalled).toBe(true);
    expect(whoamiCallCount).toBe(2);
    expect(report.loggedIn).toBe(true);
    expect(report.ready).toBe(true);
  });

  it("does not call loginFn when already logged in", async () => {
    let loginCalled = false;

    const run = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }
      if (args[0] === "whoami") {
        return {
          code: 0,
          stdout: '{"username":"sam@example.com"}\n',
          stderr: ""
        };
      }
      return { code: 0, stdout: '["auto"]\n', stderr: "" };
    };

    const report = await getSetupReport({
      run,
      autoLogin: true,
      loginFn: async () => {
        loginCalled = true;
        return { code: 0 };
      }
    });

    expect(loginCalled).toBe(false);
    expect(report.loggedIn).toBe(true);
  });

  it("does not call loginFn when autoLogin is false", async () => {
    let loginCalled = false;

    const run = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }
      if (args[0] === "whoami") {
        return { code: 1, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: '["auto"]\n', stderr: "" };
    };

    const report = await getSetupReport({
      run,
      loginFn: async () => {
        loginCalled = true;
        return { code: 0 };
      }
    });

    expect(loginCalled).toBe(false);
    expect(report.loggedIn).toBe(false);
  });

  it("stays not-logged-in when loginFn fails", async () => {
    const run = async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "1.26.0\n", stderr: "" };
      }
      if (args[0] === "whoami") {
        return { code: 1, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: '["auto"]\n', stderr: "" };
    };

    const report = await getSetupReport({
      run,
      autoLogin: true,
      loginFn: async () => ({ code: 1 })
    });

    expect(report.loggedIn).toBe(false);
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

/**
 * 契约测试 — 基于真实 kiro-cli 输出的 fixture
 *
 * 这些测试用例使用录制的真实 CLI 输出而非手工 mock，
 * 确保解析逻辑能正确处理实际外部系统的行为。
 */
describe("setup contract tests (real kiro-cli output)", () => {
  // 真实 kiro-cli whoami --format json (IAM Identity Center 登录)
  const REAL_WHOAMI_IAM = JSON.stringify({
    accountType: "IamIdentityCenter",
    email: "sammore.w@mexc.com",
    region: "ap-northeast-1",
    startUrl: "https://d-9567af5588.awsapps.com/start"
  });

  // 真实 kiro-cli whoami --format json — 追加了非 JSON 文本（Profile 信息）
  const REAL_WHOAMI_MIXED = `${REAL_WHOAMI_IAM}\n\nProfile:\nKiroProfile-us-east-1\narn:aws:codewhisperer:us-east-1:471112993982:profile/GMAUN4KMEDEV\n`;

  // 真实 kiro-cli chat --list-models --format json（嵌套对象结构）
  const REAL_MODELS = JSON.stringify({
    models: [
      { model_name: "auto", description: "Models chosen by task", model_id: "auto", context_window_tokens: 1000000, rate_multiplier: 1.0, rate_unit: "Credit" },
      { model_name: "claude-opus-4.6", description: "The latest Claude Opus", model_id: "claude-opus-4.6", context_window_tokens: 1000000, rate_multiplier: 2.2, rate_unit: "Credit" },
      { model_name: "claude-sonnet-4.6", description: "The latest Claude Sonnet", model_id: "claude-sonnet-4.6", context_window_tokens: 1000000, rate_multiplier: 1.3, rate_unit: "Credit" },
      { model_name: "claude-haiku-4.5", description: "The latest Claude Haiku", model_id: "claude-haiku-4.5", context_window_tokens: 200000, rate_multiplier: 0.4, rate_unit: "Credit" },
      { model_name: "deepseek-3.2", description: "Experimental preview of DeepSeek V3.2", model_id: "deepseek-3.2", context_window_tokens: 164000, rate_multiplier: 0.25, rate_unit: "Credit" }
    ],
    default_model: "auto"
  });

  function makeRealRun({ whoami = REAL_WHOAMI_MIXED, models = REAL_MODELS } = {}) {
    return async (args) => {
      if (args[0] === "version") {
        return { code: 0, stdout: "kiro-cli 1.28.3\n", stderr: "" };
      }
      if (args[0] === "whoami") {
        return { code: 0, stdout: whoami, stderr: "" };
      }
      return { code: 0, stdout: models, stderr: "" };
    };
  }

  it("handles IAM Identity Center login with email field (no username)", async () => {
    const report = await getSetupReport({ run: makeRealRun() });

    expect(report.loggedIn).toBe(true);
    expect(report.whoami).toBeTruthy();
    expect(report.whoami.email).toBe("sammore.w@mexc.com");
  });

  it("parses whoami when JSON is followed by non-JSON Profile text", async () => {
    const report = await getSetupReport({ run: makeRealRun() });

    expect(report.loggedIn).toBe(true);
    expect(report.ready).toBe(true);
  });

  it("extracts model names from nested {models: [{model_name: ...}]} structure", async () => {
    const report = await getSetupReport({ run: makeRealRun() });

    expect(report.ready).toBe(true);
    expect(report.models).toContain("auto");
    expect(report.models).toContain("claude-opus-4.6");
    expect(report.models).toContain("claude-sonnet-4.6");
    expect(report.models).toContain("claude-haiku-4.5");
    expect(report.models).toContain("deepseek-3.2");
  });

  it("handles pure JSON whoami output without trailing Profile text", async () => {
    const report = await getSetupReport({
      run: makeRealRun({ whoami: `${REAL_WHOAMI_IAM}\n` })
    });

    expect(report.loggedIn).toBe(true);
    expect(report.whoami.email).toBe("sammore.w@mexc.com");
  });

  it("handles legacy username-based whoami alongside IAM email-based whoami", async () => {
    const legacyWhoami = JSON.stringify({ username: "dev@local", loggedIn: true });
    const report = await getSetupReport({
      run: makeRealRun({ whoami: `${legacyWhoami}\n` })
    });

    expect(report.loggedIn).toBe(true);
    expect(report.whoami.username).toBe("dev@local");
  });

  it("full real-world setup scenario: IAM + mixed output + nested models", async () => {
    const report = await getSetupReport({ run: makeRealRun() });

    expect(report).toMatchObject({
      ready: true,
      installed: true,
      loggedIn: true,
      version: "kiro-cli 1.28.3"
    });
    expect(report.whoami.email).toBe("sammore.w@mexc.com");
    expect(report.models.length).toBeGreaterThanOrEqual(5);
    expect(report.models).toContain("auto");
  });

  it("falls back gracefully when whoami has neither username nor email", async () => {
    const noIdentityWhoami = JSON.stringify({ accountType: "IamIdentityCenter", region: "us-east-1" });
    const report = await getSetupReport({
      run: makeRealRun({ whoami: `${noIdentityWhoami}\n` })
    });

    expect(report.loggedIn).toBe(false);
    expect(report.whoami).toBeNull();
  });

  it("falls back gracefully when models is empty object without models array", async () => {
    const report = await getSetupReport({
      run: makeRealRun({ models: JSON.stringify({ default_model: "auto" }) })
    });

    expect(report.loggedIn).toBe(true);
    expect(report.models).toEqual([]);
    expect(report.ready).toBe(false);
  });
});
