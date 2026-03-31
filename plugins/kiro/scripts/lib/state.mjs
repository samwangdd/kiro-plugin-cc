import { randomUUID } from "node:crypto";
import path from "node:path";
import { open, readFile, rm, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { ensureDir, readJson, resolveStateHome, writeJson } from "./fs.mjs";

export const DEFAULT_STATE = {
  version: 1,
  config: {
    timeoutMs: 300000
  },
  jobs: {}
};

function getNextJobSequence(jobs) {
  return (
    Object.values(jobs).reduce((max, job) => {
      const sequence = Number(job?.sequence || 0);
      return sequence > max ? sequence : max;
    }, 0) + 1
  );
}

const LOCK_RETRY_MS = 10;
const LOCK_STALE_MS = 1000;

function getStateLockPath(env = process.env) {
  return path.join(resolveStateHome(env), ".state.lock");
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }

    if (error.code === "EPERM") {
      return true;
    }

    throw error;
  }
}

function parseLockContents(contents) {
  try {
    const parsed = JSON.parse(contents);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function readLockMetadata(lockPath) {
  try {
    const contents = await readFile(lockPath, "utf8");
    return parseLockContents(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function getLockAgeMs(lockPath) {
  try {
    const lockStats = await stat(lockPath);
    return Date.now() - lockStats.mtimeMs;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function isLockStale(metadata) {
  const createdAtMs = Date.parse(metadata.createdAt);

  if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > LOCK_STALE_MS) {
    return true;
  }

  if (Number.isFinite(metadata.pid) && !isPidAlive(metadata.pid)) {
    return true;
  }

  return false;
}

async function acquireStateLock(lockPath) {
  const token = randomUUID();
  const ownerPid = process.pid;
  const createdAt = new Date().toISOString();

  for (;;) {
    try {
      const handle = await open(lockPath, "wx");

      try {
        await handle.writeFile(
          `${JSON.stringify({
            token,
            pid: ownerPid,
            createdAt
          })}\n`
        );
      } catch (error) {
        await handle.close().catch(() => {});
        await rm(lockPath, { force: true });
        throw error;
      }

      await handle.close();

      return async () => {
        try {
          const current = await readLockMetadata(lockPath);
          if (current?.token === token) {
            await rm(lockPath, { force: true });
          }
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      const lockMetadata = await readLockMetadata(lockPath);

      if (lockMetadata == null) {
        const lockAgeMs = await getLockAgeMs(lockPath);

        if (lockAgeMs == null || lockAgeMs > LOCK_STALE_MS) {
          await rm(lockPath, { force: true });
          continue;
        }

        await delay(LOCK_RETRY_MS);
        continue;
      }

      if (isLockStale(lockMetadata)) {
        await rm(lockPath, { force: true });
        continue;
      }

      await delay(LOCK_RETRY_MS);
    }
  }
}

async function withStateLock(env, run) {
  const lockPath = getStateLockPath(env);
  await ensureDir(path.dirname(lockPath));
  const release = await acquireStateLock(lockPath);

  try {
    return await run();
  } finally {
    await release();
  }
}

export function getStatePaths(env = process.env) {
  const home = resolveStateHome(env);
  return {
    home,
    jobsDir: path.join(home, "jobs"),
    stateFile: path.join(home, "state.json")
  };
}

export function getJobPaths(jobId, env = process.env) {
  const { jobsDir } = getStatePaths(env);
  return {
    metaPath: path.join(jobsDir, `${jobId}.meta.json`),
    logPath: path.join(jobsDir, `${jobId}.log`)
  };
}

export async function ensureStateLayout(env = process.env) {
  const paths = getStatePaths(env);
  await ensureDir(paths.jobsDir);

  const current = await readJson(paths.stateFile, null);
  if (current == null) {
    await writeJson(paths.stateFile, DEFAULT_STATE);
  }

  return paths;
}

export async function loadGlobalState(env = process.env) {
  const { stateFile } = await ensureStateLayout(env);
  return readJson(stateFile, structuredClone(DEFAULT_STATE));
}

export async function saveGlobalState(nextState, env = process.env) {
  return withStateLock(env, async () => {
    const { stateFile } = await ensureStateLayout(env);
    await writeJson(stateFile, nextState);
    return nextState;
  });
}

export async function createJobMeta(command, options = {}, env = process.env) {
  return withStateLock(env, async () => {
    const id = `job-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const state = await loadGlobalState(env);
    const sequence = getNextJobSequence(state.jobs);
    const { metaPath, logPath } = getJobPaths(id, env);

    const job = {
      id,
      command,
      options,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      sequence,
      metaPath,
      logPath
    };

    await writeJson(metaPath, job);

    state.jobs[id] = {
      command,
      status: job.status,
      createdAt: now,
      updatedAt: now,
      sequence
    };
    const { stateFile } = await ensureStateLayout(env);
    await writeJson(stateFile, state);

    return job;
  });
}

export async function readJobMeta(jobId, env = process.env) {
  return readJson(getJobPaths(jobId, env).metaPath, null);
}

export async function updateJobMeta(jobId, patch, env = process.env) {
  return withStateLock(env, async () => {
    const current = await readJobMeta(jobId, env);

    if (!current) {
      throw new Error(`Unknown job: ${jobId}`);
    }

    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    await writeJson(getJobPaths(jobId, env).metaPath, next);

    const state = await loadGlobalState(env);
    state.jobs[jobId] = {
      command: next.command,
      status: next.status,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
      summary: next.summary || "",
      sequence: current.sequence || 0
    };
    const { stateFile } = await ensureStateLayout(env);
    await writeJson(stateFile, state);

    return next;
  });
}

export async function listJobMeta(env = process.env) {
  const state = await loadGlobalState(env);
  return Object.entries(state.jobs)
    .map(([id, job]) => ({ id, ...job }))
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        (right.sequence || 0) - (left.sequence || 0)
    );
}
