import process from "node:process";
import { spawn } from "node:child_process";

import { writeText } from "./fs.mjs";
import { getJobPaths, readJobMeta, updateJobMeta } from "./state.mjs";

export async function runTrackedJob(job, execute, env = process.env) {
  await updateJobMeta(job.id, { status: "running", startedAt: new Date().toISOString() }, env);

  try {
    const result = await execute();
    await writeText(getJobPaths(job.id, env).logPath, result.stdout || "");

    const finalStatus = result.needsReview ? "needs_review" : (result.code === 0 ? "completed" : "failed");
    return updateJobMeta(job.id, {
      status: finalStatus,
      summary: result.summary || "",
      stderr: result.stderr || "",
      exitCode: result.code ?? 0,
      finishedAt: new Date().toISOString()
    }, env);
  } catch (error) {
    await writeText(getJobPaths(job.id, env).logPath, error.stack || error.message);
    return updateJobMeta(job.id, {
      status: "failed",
      summary: error.message,
      failureReason: "runtime_error",
      finishedAt: new Date().toISOString()
    }, env);
  }
}

export async function startDetachedJob(jobId, { scriptPath, env = process.env, spawnImpl = spawn } = {}) {
  const child = spawnImpl(process.execPath, [scriptPath, "run-job", jobId], {
    detached: true,
    stdio: "ignore",
    env
  });

  child.unref();
  return child.pid;
}

export async function cancelTrackedJob(jobId, { env = process.env, kill = process.kill } = {}) {
  const job = await readJobMeta(jobId, env);

  if (!job) {
    throw new Error(`Unknown job: ${jobId}`);
  }

  if (job.pid) {
    kill(job.pid, "SIGTERM");
  }

  return updateJobMeta(jobId, {
    status: "failed",
    failureReason: "cancelled",
    finishedAt: new Date().toISOString()
  }, env);
}
