import path from "node:path";

import { mkdir, readFile, writeFile } from "node:fs/promises";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function bumpPatchVersion(version) {
  const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

export async function syncLocalPluginVersions(rootDir, nextVersion, seed = {}) {
  const packagePath = path.join(rootDir, "package.json");
  const marketplacePath = path.join(rootDir, ".claude-plugin", "marketplace.json");
  const pluginPath = path.join(rootDir, "plugins", "kiro", ".claude-plugin", "plugin.json");

  const packageJson = JSON.parse(seed.packageJsonText ?? await readFile(packagePath, "utf8"));
  const marketplaceJson = JSON.parse(seed.marketplaceJsonText ?? await readFile(marketplacePath, "utf8"));
  const pluginJson = JSON.parse(seed.pluginJsonText ?? await readFile(pluginPath, "utf8"));

  packageJson.version = nextVersion;
  marketplaceJson.metadata = {
    ...(marketplaceJson.metadata || {}),
    version: nextVersion
  };

  if (!Array.isArray(marketplaceJson.plugins) || marketplaceJson.plugins.length === 0) {
    throw new Error("Marketplace has no plugins to version.");
  }
  marketplaceJson.plugins[0] = {
    ...marketplaceJson.plugins[0],
    version: nextVersion
  };

  pluginJson.version = nextVersion;

  await writeJson(packagePath, packageJson);
  await writeJson(marketplacePath, marketplaceJson);
  await writeJson(pluginPath, pluginJson);

  return {
    version: nextVersion,
    packagePath,
    marketplacePath,
    pluginPath
  };
}
