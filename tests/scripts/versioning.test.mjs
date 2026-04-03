import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { bumpPatchVersion, syncLocalPluginVersions } from "../../scripts/lib/versioning.mjs";

describe("local plugin versioning", () => {
  it("bumps a patch version", () => {
    expect(bumpPatchVersion("0.1.0")).toBe("0.1.1");
    expect(bumpPatchVersion("1.9.9")).toBe("1.9.10");
  });

  it("rejects unsupported version formats", () => {
    expect(() => bumpPatchVersion("0.1")).toThrow("Unsupported version format");
    expect(() => bumpPatchVersion("0.1.0-rc.1")).toThrow("Unsupported version format");
  });

  it("syncs package, marketplace, and plugin manifest versions", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "kiro-versioning-"));
    const packagePath = path.join(rootDir, "package.json");
    const marketplacePath = path.join(rootDir, ".claude-plugin", "marketplace.json");
    const pluginPath = path.join(rootDir, "plugins", "kiro", ".claude-plugin", "plugin.json");

    await syncLocalPluginVersions(rootDir, "0.1.7", {
      packageJsonText: JSON.stringify({ name: "kiro-plugin-cc", version: "0.1.0" }, null, 2),
      marketplaceJsonText: JSON.stringify({
        name: "samwangdd-kiro",
        metadata: { version: "0.1.0" },
        plugins: [{ name: "kiro", version: "0.1.0" }]
      }, null, 2),
      pluginJsonText: JSON.stringify({ name: "kiro", version: "0.1.0" }, null, 2)
    });

    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    const marketplaceJson = JSON.parse(await readFile(marketplacePath, "utf8"));
    const pluginJson = JSON.parse(await readFile(pluginPath, "utf8"));

    expect(packageJson.version).toBe("0.1.7");
    expect(marketplaceJson.metadata.version).toBe("0.1.7");
    expect(marketplaceJson.plugins[0].version).toBe("0.1.7");
    expect(pluginJson.version).toBe("0.1.7");
  });
});
