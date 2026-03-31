import { randomUUID } from "node:crypto";
import path from "node:path";

import { ensureDir, readJson, resolveStateHome, writeJson } from "./fs.mjs";

const DEFAULT_STATE = {
  version: 1,
  config: {
    timeoutMs: 300000
  },
  jobs: {}
};

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
  const { stateFile } = await ensureStateLayout(env);
  await writeJson(stateFile, nextState);
  return nextState;
}

export async function createJobMeta(command, options = {}, env = process.env) {
  const id = `job-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const { metaPath, logPath } = getJobPaths(id, env);

  const job = {
    id,
    command,
    options,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    metaPath,
    logPath
  };

  await writeJson(metaPath, job);

  const state = await loadGlobalState(env);
  state.jobs[id] = {
    command,
    status: job.status,
    createdAt: now,
    updatedAt: now
  };
  await saveGlobalState(state, env);

  return job;
}

export async function readJobMeta(jobId, env = process.env) {
  return readJson(getJobPaths(jobId, env).metaPath, null);
}

export async function updateJobMeta(jobId, patch, env = process.env) {
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
    summary: next.summary || ""
  };
  await saveGlobalState(state, env);

  return next;
}

export async function listJobMeta(env = process.env) {
  const state = await loadGlobalState(env);
  return Object.entries(state.jobs)
    .map(([id, job]) => ({ id, ...job }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
