import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

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

  it("defines all v1 slash commands and the rescue agent", async () => {
    const review = await readFile("plugins/kiro/commands/review.md", "utf8");
    const rescue = await readFile("plugins/kiro/commands/rescue.md", "utf8");
    const setup = await readFile("plugins/kiro/commands/setup.md", "utf8");
    const status = await readFile("plugins/kiro/commands/status.md", "utf8");
    const result = await readFile("plugins/kiro/commands/result.md", "utf8");
    const cancel = await readFile("plugins/kiro/commands/cancel.md", "utf8");
    const agent = await readFile("plugins/kiro/agents/kiro-rescue.md", "utf8");

    expect(review).toContain("kiro-companion.mjs");
    expect(rescue).toContain("kiro:kiro-rescue");
    expect(setup).toContain("kiro-companion.mjs");
    expect(status).toContain("kiro-companion.mjs");
    expect(result).toContain("kiro-companion.mjs");
    expect(cancel).toContain("kiro-companion.mjs");
    expect(agent).toContain("kiro-cli-runtime");
  });
});
