import { describe, expect, it, vi } from "vitest";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { withTempHome } from "../helpers/temp-env.mjs";
import {
  DEFAULT_STATE,
  createJobMeta,
  getJobPaths,
  getStatePaths,
  listJobMeta,
  loadGlobalState,
  readJobMeta,
  updateJobMeta
} from "../../plugins/kiro/scripts/lib/state.mjs";

describe("job state persistence", () => {
  it("exports the default global state shape", () => {
    expect(DEFAULT_STATE).toEqual({
      version: 1,
      config: {
        timeoutMs: 300000
      },
      jobs: {}
    });
  });

  it("creates and updates persisted job metadata", async () => {
    await withTempHome(async (_home, env) => {
      const created = await createJobMeta("review", { base: "main" }, env);

      expect(created.command).toBe("review");
      expect(created.status).toBe("pending");
      expect(getJobPaths(created.id, env).logPath).toContain(`${created.id}.log`);

      const updated = await updateJobMeta(
        created.id,
        {
          status: "completed",
          summary: "done"
        },
        env
      );

      expect(updated.status).toBe("completed");

      const stored = await readJobMeta(created.id, env);
      expect(stored.summary).toBe("done");

      const jobs = await listJobMeta(env);
      expect(jobs).toHaveLength(1);

      const globalState = await loadGlobalState(env);
      expect(globalState.jobs[created.id].status).toBe("completed");
      expect(globalState.jobs[created.id].summary).toBe("done");
    });
  });

  it("lists jobs newest first by createdAt", async () => {
    await withTempHome(async (_home, env) => {
      const first = await createJobMeta("review", { base: "main" }, env);
      const second = await createJobMeta("rescue", { task: "fix" }, env);

      const jobs = await listJobMeta(env);

      expect(jobs).toHaveLength(2);
      expect(jobs.map((job) => job.id)).toEqual([second.id, first.id]);
    });
  });

  it("lists the newer job first when createdAt is identical", async () => {
    await withTempHome(async (_home, env) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));

      try {
        const first = await createJobMeta("review", { base: "main" }, env);
        const second = await createJobMeta("rescue", { task: "fix" }, env);

        const jobs = await listJobMeta(env);

        expect(jobs).toHaveLength(2);
        expect(jobs[0].id).toBe(second.id);
        expect(jobs[0].createdAt).toBe(first.createdAt);
        expect(jobs[1].id).toBe(first.id);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("persists all concurrently created jobs", async () => {
    await withTempHome(async (_home, env) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));

      try {
        const jobs = await Promise.all(
          Array.from({ length: 20 }, (_, index) =>
            createJobMeta("review", { index }, env)
          )
        );

        const globalState = await loadGlobalState(env);
        const listedJobs = await listJobMeta(env);

        expect(jobs).toHaveLength(20);
        expect(Object.keys(globalState.jobs)).toHaveLength(20);
        expect(listedJobs).toHaveLength(20);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("does not steal a live lock and times out while waiting for it", async () => {
    await withTempHome(async (home, env) => {
      const lockPath = path.join(home, ".state.lock");
      const lockContents = `${JSON.stringify({
        token: "live-token",
        pid: process.pid,
        createdAt: "2026-03-31T00:00:00.000Z"
      })}\n`;

      await writeFile(lockPath, lockContents, "utf8");

      env.KIRO_COMPANION_LOCK_TIMEOUT_MS = "50";

      const pending = createJobMeta("review", { base: "main" }, env);

      await expect(pending).rejects.toThrow(/timed out/i);
      await expect(readFile(lockPath, "utf8")).resolves.toBe(lockContents);
    });
  });

  it("does not bootstrap state on read", async () => {
    await withTempHome(async (home, env) => {
      const { stateFile } = getStatePaths(env);

      const loaded = await loadGlobalState(env);
      const listed = await listJobMeta(env);

      expect(loaded).toEqual(DEFAULT_STATE);
      expect(listed).toEqual([]);

      await expect(access(stateFile)).rejects.toMatchObject({
        code: "ENOENT"
      });
    });
  });

  it("preserves existing written state on read", async () => {
    await withTempHome(async (_home, env) => {
      const { stateFile } = getStatePaths(env);
      const seeded = {
        version: 1,
        config: {
          timeoutMs: 123
        },
        jobs: {
          job_1: {
            command: "review",
            status: "pending",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            sequence: 1
          }
        }
      };

      await writeFile(stateFile, `${JSON.stringify(seeded, null, 2)}\n`, "utf8");

      const loaded = await loadGlobalState(env);
      const listed = await listJobMeta(env);

      expect(loaded).toEqual(seeded);
      expect(listed).toHaveLength(1);
      expect(listed[0].command).toBe("review");
    });
  });

});
