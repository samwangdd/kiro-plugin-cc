#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

import { readHandoffText } from "./lib/handoff.mjs";
import { collectReviewContext } from "./lib/git.mjs";
import { buildChatArgs, getSetupReport, runKiro } from "./lib/kiro.mjs";
import { buildReviewPrompt, loadReviewAssets, parseReviewOutput } from "./lib/prompts.mjs";
import { renderReviewReport, renderSetupReport } from "./lib/render.mjs";

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

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function readOption(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  args.splice(index, 2);
  return value;
}

function rejectUnknownArgs(args) {
  for (const arg of args) {
    if (arg.startsWith("--")) {
      throw new Error(`Unknown setup flag: ${arg}`);
    }
    throw new Error(`Unknown setup argument: ${arg}`);
  }
}

const NOT_IMPLEMENTED_COMMANDS = new Set(["rescue", "status", "result", "cancel"]);

const DEFAULT_DEPS = {
  write: defaultWrite,
  getSetupReport,
  renderSetupReport,
  collectReviewContext,
  readHandoffText,
  loadReviewAssets,
  buildReviewPrompt,
  runReviewChat: (prompt) => runKiro(buildChatArgs({ prompt })),
  parseReviewOutput,
  renderReviewReport
};

export async function runCli(argv = process.argv.slice(2), deps = DEFAULT_DEPS) {
  const args = [...argv];

  if (args.length === 0) {
    deps.write(`${USAGE}\n`);
    return 0;
  }

  const command = args.shift();

  if (command === "setup") {
    const asJson = readFlag(args, "--json");
    rejectUnknownArgs(args);
    const report = await deps.getSetupReport();
    deps.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : deps.renderSetupReport(report));
    return report.ready ? 0 : 1;
  }

  if (command === "review") {
    const base = readOption(args, "--base");
    const reviewContext = await deps.collectReviewContext({ base });
    const handoffText = await deps.readHandoffText(process.cwd());
    const assets = await deps.loadReviewAssets();
    const prompt = deps.buildReviewPrompt({
      template: assets.template,
      schema: assets.schema,
      handoffText,
      reviewContext
    });
    const response = await deps.runReviewChat(prompt);
    const parsed = deps.parseReviewOutput(response.stdout, assets.schema);
    deps.write(deps.renderReviewReport(parsed));
    return 0;
  }

  if (NOT_IMPLEMENTED_COMMANDS.has(command)) {
    throw new Error(`Not implemented yet: ${command}`);
  }

  throw new Error(`Unknown command: ${command}`);
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
