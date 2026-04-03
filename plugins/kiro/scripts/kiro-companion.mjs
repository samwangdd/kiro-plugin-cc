#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

import { readText } from "./lib/fs.mjs";
import { readHandoff, readHandoffText, writeHandoff } from "./lib/handoff.mjs";
import { collectReviewContext } from "./lib/git.mjs";
import { cancelTrackedJob, runTrackedJob, startDetachedJob } from "./lib/job-control.mjs";
import { buildChatArgs, getSetupReport, login, runKiro } from "./lib/kiro.mjs";
import { buildRescuePrompt, buildReviewPrompt, loadReviewAssets, parseReviewOutput } from "./lib/prompts.mjs";
import {
  renderCancelReport,
  renderRescueStartReport,
  renderResultReport,
  renderReviewReport,
  renderSetupReport,
  renderStatusReport,
  renderTasksReport
} from "./lib/render.mjs";
import { createJobMeta, listJobMeta, readJobMeta, updateJobMeta } from "./lib/state.mjs";

const USAGE = [
  "Usage:",
  "  node plugins/kiro/scripts/kiro-companion.mjs setup [--json]",
  "  node plugins/kiro/scripts/kiro-companion.mjs review [--base <ref>] [--wait|--background]",
  "  node plugins/kiro/scripts/kiro-companion.mjs rescue [--fresh|--resume] [--model <model>] [--agent <agent>] [--wait|--background] [task]",
  "  node plugins/kiro/scripts/kiro-companion.mjs status [job-id] [--json]",
  "  node plugins/kiro/scripts/kiro-companion.mjs tasks",
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

function firstMeaningfulLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

async function executeReviewJob(options, deps) {
  const reviewContext = await deps.collectReviewContext({ base: options.base });
  const handoffText = await deps.readHandoffText(process.cwd());
  const assets = await deps.loadReviewAssets();
  const prompt = deps.buildReviewPrompt({
    template: assets.template,
    schema: assets.schema,
    handoffText,
    reviewContext
  });
  const response = await deps.runReviewChat(prompt);

  try {
    const parsed = deps.parseReviewOutput(response.stdout, assets.schema);
    return {
      stdout: deps.renderReviewReport(parsed),
      stderr: "",
      code: 0,
      summary: parsed.summary
    };
  } catch {
    return {
      stdout: response.stdout,
      stderr: "",
      code: 0,
      summary: "Review output needs manual inspection",
      needsReview: true
    };
  }
}

async function executeRescueJob(options, deps) {
  const snapshot = await deps.readHandoff(process.cwd());
  const visibleHandoff = await deps.readHandoffText(process.cwd());
  const prompt = deps.buildRescuePrompt({
    taskText: options.task,
    handoffText: visibleHandoff
  });
  const response = await deps.runRescueChat(prompt, options);

  await deps.writeHandoff(process.cwd(), {
    ...snapshot,
    completed: [...snapshot.completed, `Kiro rescue finished — ${firstMeaningfulLine(response.stdout) || "see job log"}`],
    current: [],
    findings: [...snapshot.findings, firstMeaningfulLine(response.stdout) || "Kiro rescue returned output"]
  });

  return {
    stdout: response.stdout,
    stderr: response.stderr,
    code: response.code,
    summary: firstMeaningfulLine(response.stdout) || "Rescue run complete"
  };
}

const DEFAULT_DEPS = {
  write: defaultWrite,
  getSetupReport,
  renderSetupReport,
  collectReviewContext,
  readHandoff,
  readHandoffText,
  writeHandoff,
  loadReviewAssets,
  buildReviewPrompt,
  buildRescuePrompt,
  runReviewChat: (prompt) => runKiro(buildChatArgs({ prompt })),
  runRescueChat: (prompt, options) => runKiro(buildChatArgs({
    prompt,
    resume: options.resume,
    model: options.model,
    agent: options.agent
  })),
  parseReviewOutput,
  renderReviewReport,
  createJobMeta,
  updateJobMeta,
  listJobMeta,
  readJobMeta,
  runTrackedJob,
  startDetachedJob,
  cancelTrackedJob,
  renderRescueStartReport,
  renderStatusReport,
  renderResultReport,
  renderCancelReport,
  renderTasksReport,
  getStatusReport: async () => ({
    jobs: await listJobMeta()
  }),
  getTasksReport: async () => {
    const jobs = await listJobMeta();
    const active = jobs.filter(j => j.status === "pending" || j.status === "running");
    return { active, total: jobs.length };
  },
  getResultReport: async (jobId) => {
    const job = await readJobMeta(jobId);
    return {
      job,
      logText: await readText(job.logPath, "")
    };
  },
  cancelJobAndReport: async (jobId) => ({
    job: await cancelTrackedJob(jobId)
  })
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
    const report = await deps.getSetupReport({ autoLogin: true });
    deps.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : deps.renderSetupReport(report));
    return report.ready ? 0 : 1;
  }

  if (command === "review" || command === "rescue") {
    const base = readOption(args, "--base");
    const model = readOption(args, "--model");
    const agent = readOption(args, "--agent");
    const asBackground = readFlag(args, "--background");
    readFlag(args, "--wait");
    const resume = readFlag(args, "--resume");
    const fresh = readFlag(args, "--fresh");

    if (resume && fresh) {
      throw new Error("Choose either --resume or --fresh.");
    }

    const options = {
      base,
      model,
      agent,
      resume,
      fresh,
      task: args.join(" ").trim()
    };

    if (command === "rescue" && !options.task) {
      throw new Error("Rescue requires a task description.");
    }

    if (command === "review" && !asBackground) {
      const result = await executeReviewJob(options, deps);
      deps.write(result.stdout);
      return result.needsReview ? 2 : 0;
    }

    if (command === "rescue" && !asBackground) {
      const job = await deps.createJobMeta(command, options);
      let result;
      const tracked = await deps.runTrackedJob(job, async () => {
        result = await executeRescueJob(options, deps);
        return result;
      });
      deps.write(result?.stdout || "");
      return tracked.status === "completed" ? 0 : 1;
    }

    const job = await deps.createJobMeta(command, options);
    const pid = await deps.startDetachedJob(job.id, {
      scriptPath: process.argv[1]
    });
    await deps.updateJobMeta(job.id, { pid });
    deps.write(deps.renderRescueStartReport({ ...job, pid }));
    return 0;
  }

  if (command === "run-job") {
    const jobId = args[0];
    const job = await deps.readJobMeta(jobId);

    if (!job) {
      throw new Error(`Unknown job: ${jobId}`);
    }

    const result = await deps.runTrackedJob(job, () => (
      job.command === "review"
        ? executeReviewJob(job.options, deps)
        : executeRescueJob(job.options, deps)
    ));

    deps.write(result.summary ? `${result.summary}\n` : "");
    return result.status === "completed" ? 0 : 1;
  }

  if (command === "status") {
    const report = await deps.getStatusReport();
    deps.write(deps.renderStatusReport(report));
    return 0;
  }

  if (command === "tasks") {
    const report = await deps.getTasksReport();
    deps.write(deps.renderTasksReport(report));
    return 0;
  }

  if (command === "result") {
    const jobId = args[0];
    if (!jobId) {
      throw new Error("Result requires a job id.");
    }

    const report = await deps.getResultReport(jobId);
    deps.write(deps.renderResultReport(report));
    return 0;
  }

  if (command === "cancel") {
    const jobId = args[0];
    if (!jobId) {
      throw new Error("Cancel requires a job id.");
    }

    const report = await deps.cancelJobAndReport(jobId);
    deps.write(deps.renderCancelReport(report));
    return 0;
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
