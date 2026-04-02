import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readText } from "./fs.mjs";

const execFileAsync = promisify(execFile);

async function runGit(args, cwd, exec = execFileAsync) {
  const { stdout } = await exec("git", args, { cwd });
  return stdout;
}

export async function collectReviewContext({ cwd = process.cwd(), base = null, exec = execFileAsync } = {}) {
  const status = await runGit(["status", "--short", "--untracked-files=all"], cwd, exec);
  if (!status.trim() && !base) {
    return { target: { mode: "working-tree", label: "working tree" }, content: "" };
  }
  if (base) {
    const diff = await runGit(["diff", `${base}...HEAD`], cwd, exec);
    return { target: { mode: "base", label: `${base}...HEAD` }, content: diff };
  }
  const staged = await runGit(["diff", "--cached"], cwd, exec);
  const unstaged = await runGit(["diff"], cwd, exec);
  const untrackedFiles = status
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  const untrackedBlocks = [];
  for (const relativePath of untrackedFiles) {
    const absolutePath = path.join(cwd, relativePath);
    const contents = await readText(absolutePath, "");
    untrackedBlocks.push(`--- UNTRACKED FILE: ${relativePath} ---\n${contents}`);
  }
  return {
    target: { mode: "working-tree", label: "working tree" },
    content: [staged, unstaged, ...untrackedBlocks].filter(Boolean).join("\n")
  };
}
