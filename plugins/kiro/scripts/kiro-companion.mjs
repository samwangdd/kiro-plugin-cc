#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

const USAGE = [
  "Usage:",
  "  node plugins/kiro/scripts/kiro-companion.mjs setup [--json]",
  "  node plugins/kiro/scripts/kiro-companion.mjs review [--base <ref>] [--wait|--background]",
  "  node plugins/kiro/scripts/kiro-companion.mjs rescue [--fresh|--resume] [--model <model>] [--agent <agent>] [--wait|--background] [task]",
  "  node plugins/kiro/scripts/kiro-companion.mjs status [job-id] [--json]",
  "  node plugins/kiro/scripts/kiro-companion.mjs result <job-id> [--json]",
  "  node plugins/kiro/scripts/kiro-companion.mjs cancel <job-id> [--json]"
].join("\n");

function defaultWrite(text) {
  process.stdout.write(text);
}

export async function runCli(argv = process.argv.slice(2), deps = { write: defaultWrite }) {
  if (argv.length === 0) {
    deps.write(`${USAGE}\n`);
    return 0;
  }

  throw new Error(`Unknown command: ${argv[0]}`);
}

async function main() {
  try {
    const exitCode = await runCli();
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
