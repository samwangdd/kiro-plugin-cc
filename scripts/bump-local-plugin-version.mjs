#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { bumpPatchVersion, syncLocalPluginVersions } from "./lib/versioning.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
const currentVersion = packageJson.version;
const nextVersion = bumpPatchVersion(currentVersion);

await syncLocalPluginVersions(rootDir, nextVersion);

process.stdout.write(`Bumped local plugin version: ${currentVersion} -> ${nextVersion}\n`);
