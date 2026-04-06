import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import defaultVitestConfig from "../../vitest.config.mjs";
import e2eVitestConfig from "../../vitest.config.e2e.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

describe("plugin assets", () => {
  it("publishes a single kiro plugin from the marketplace manifest", async () => {
    const manifest = await readJson(".claude-plugin/marketplace.json");

    expect(manifest.plugins).toHaveLength(1);
    expect(manifest.plugins[0].name).toBe("kiro");
    expect(manifest.plugins[0].source).toBe("./plugins/kiro");
  });

  it("defines all v1 slash commands without publishing the deprecated rescue forwarding layer", async () => {
    const review = await readFile("plugins/kiro/commands/review.md", "utf8");
    const rescue = await readFile("plugins/kiro/commands/rescue.md", "utf8");
    const setup = await readFile("plugins/kiro/commands/setup.md", "utf8");
    const status = await readFile("plugins/kiro/commands/status.md", "utf8");
    const result = await readFile("plugins/kiro/commands/result.md", "utf8");
    const cancel = await readFile("plugins/kiro/commands/cancel.md", "utf8");

    expect(review).toContain("kiro-companion.mjs");
    expect(rescue).toContain("context: fork");
    expect(rescue).toContain("disable-model-invocation: true");
    expect(rescue).toMatch(/^allowed-tools: Bash\(node:\*\)$/m);
    expect(rescue).toContain("node \"${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs\" rescue");
    expect(rescue).toContain("Return the command stdout verbatim.");
    expect(rescue).toContain("Do not paraphrase or do follow-up work in the same turn.");
    expect(rescue).not.toContain("kiro:kiro-rescue");
    expect(setup).toContain("kiro-companion.mjs");
    expect(status).toContain("kiro-companion.mjs");
    expect(result).toContain("kiro-companion.mjs");
    expect(cancel).toContain("kiro-companion.mjs");
    await expect(access("plugins/kiro/agents/kiro-rescue.md")).rejects.toThrow();
    await expect(access("plugins/kiro/skills/kiro-cli-runtime/SKILL.md")).rejects.toThrow();
  });

  it("publishes a dedicated delegation e2e script outside default npm test", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts["test:e2e-delegation"]).toBe("vitest run --config vitest.config.e2e.mjs");
  });

  it("splits default vitest tests from dedicated e2e tests", async () => {
    expect(defaultVitestConfig.test.environment).toBe("node");
    expect(defaultVitestConfig.test.include).toEqual(["tests/**/*.test.mjs"]);
    expect(defaultVitestConfig.test.exclude).toEqual(["tests/e2e/**/*.test.mjs"]);

    expect(e2eVitestConfig.test.environment).toBe("node");
    expect(e2eVitestConfig.test.include).toEqual(["tests/e2e/**/*.test.mjs"]);
    expect(e2eVitestConfig.test.passWithNoTests).toBe(true);
  });
});
