import { describe, expect, it } from "vitest";

import { withTempHome } from "../helpers/temp-env.mjs";
import {
  createJobMeta,
  getJobPaths,
  listJobMeta,
  loadGlobalState,
  readJobMeta,
  updateJobMeta
} from "../../plugins/kiro/scripts/lib/state.mjs";

describe("job state persistence", () => {
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
    });
  });
});
