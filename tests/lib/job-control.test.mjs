import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { withTempHome } from "../helpers/temp-env.mjs";
import { createJobMeta, getJobPaths, readJobMeta } from "../../plugins/kiro/scripts/lib/state.mjs";
import {
  cancelTrackedJob,
  runTrackedJob,
  startDetachedJob
} from "../../plugins/kiro/scripts/lib/job-control.mjs";

describe("job control", () => {
  it("writes logs and marks jobs completed", async () => {
    await withTempHome(async (_home, env) => {
      const job = await createJobMeta("review", {}, env);
      const finished = await runTrackedJob(job, async () => ({
        stdout: "review complete\n",
        stderr: "",
        code: 0,
        summary: "review complete"
      }), env);

      expect(finished.status).toBe("completed");
      expect((await readJobMeta(job.id, env)).summary).toBe("review complete");
      expect(await readFile(getJobPaths(job.id, env).logPath, "utf8")).toBe("review complete\n");
    });
  });

  it("stores pid for detached jobs and marks cancelled jobs as failed", async () => {
    await withTempHome(async (_home, env) => {
      const job = await createJobMeta("rescue", {}, env);
      const pid = await startDetachedJob(job.id, {
        scriptPath: "/tmp/kiro-companion.mjs",
        env,
        spawnImpl: () => ({
          pid: 4242,
          unref() {}
        })
      });

      expect(pid).toBe(4242);

      const cancelled = await cancelTrackedJob(job.id, {
        env,
        kill: () => {}
      });

      expect(cancelled.status).toBe("failed");
      expect(cancelled.failureReason).toBe("cancelled");
    });
  });
});
