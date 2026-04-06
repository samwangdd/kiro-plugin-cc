import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";

import { findKeyBashCommands, parseClaudeStream } from "./claude-stream.mjs";

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function getCurrentTurnEvents(events) {
  let startIndex = -1;

  for (let index = 0; index < events.length; index += 1) {
    if (findKeyBashCommands([events[index]]).length > 0) {
      startIndex = index;
    }
  }

  if (startIndex === -1) {
    return events;
  }

  const resultIndex = events.findIndex((event, index) => index > startIndex && event?.type === "result");
  return events.slice(startIndex, resultIndex === -1 ? undefined : resultIndex);
}

async function makeTempDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createStubKiroCli(binDir, sentinel) {
  const filePath = path.join(binDir, "kiro-cli");
  const script = [
    "#!/bin/sh",
    'cmd="$1"',
    "shift || true",
    'case "$cmd" in',
    `  chat) printf '%s\\n' '${sentinel}' ;;`,
    `  version) printf '%s\\n' 'kiro-cli 0.0-test' ;;`,
    `  whoami) printf '%s\\n' '{\"username\":\"stub-user\"}' ;;`,
    "  login) exit 0 ;;",
    `  *) printf 'unexpected:%s\\n' "$cmd" >&2; exit 1 ;;`,
    "esac"
  ].join("\n");

  await writeFile(filePath, `${script}\n`, "utf8");
  await chmod(filePath, 0o755);
  return filePath;
}

export async function runDelegationSmoke({ pluginDir, taskText, sentinel }) {
  const rootDir = process.cwd();
  const tempBin = await makeTempDir("kiro-e2e-bin-");
  const projectDir = await makeTempDir("kiro-e2e-project-");
  const homeDir = await makeTempDir("kiro-e2e-home-");

  try {
    await createStubKiroCli(tempBin, sentinel);

    const command = process.env.CLAUDE_BIN || "claude";
    const args = [
      "-p",
      "--bare",
      "--verbose",
      "--permission-mode",
      "dontAsk",
      "--plugin-dir",
      path.resolve(rootDir, pluginDir),
      "--output-format",
      "stream-json",
      `/kiro:rescue --fresh ${taskText}`
    ];

    const run = await runProcess(command, args, {
      cwd: projectDir,
      env: {
        ...process.env,
        CLAUDE_CODE_SIMPLE: "1",
        KIRO_COMPANION_HOME: homeDir,
        PATH: `${tempBin}${path.delimiter}${process.env.PATH || ""}`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (run.code !== 0) {
      throw new Error(`Claude smoke run failed: ${run.stderr || run.stdout}`);
    }

    const allEvents = parseClaudeStream(run.stdout);
    const events = getCurrentTurnEvents(allEvents);
    const init = allEvents.find((event) => event.type === "system" && event.subtype === "init") || null;
    const resultEvent = allEvents.findLast((event) => event.type === "result") || null;
    const jobsDir = path.join(homeDir, "jobs");
    const jobFiles = (await readdir(jobsDir)).filter((name) => name.endsWith(".meta.json"));

    if (jobFiles.length !== 1) {
      throw new Error(`Expected exactly one job meta file, found ${jobFiles.length}`);
    }

    const metaPath = path.join(jobsDir, jobFiles[0]);
    const jobMeta = JSON.parse(await readFile(metaPath, "utf8"));
    const state = JSON.parse(await readFile(path.join(homeDir, "state.json"), "utf8"));
    const logText = await readFile(jobMeta.logPath, "utf8");
    const handoffText = await readFile(path.join(projectDir, ".kiro-companion", "handoff.md"), "utf8");

    return {
      events,
      init,
      finalResult: resultEvent?.result || "",
      jobId: jobMeta.id,
      jobMeta,
      state,
      logText,
      handoffText
    };
  } finally {
    await rm(tempBin, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  }
}
