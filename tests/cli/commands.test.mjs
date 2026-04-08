import { describe, expect, it } from "vitest";

import { runCli } from "../../plugins/kiro/scripts/kiro-companion.mjs";

describe("high-level CLI commands", () => {
  it("tracks foreground rescue jobs and returns stdout when kiro-cli succeeds", async () => {
    let output = "";
    let createdJob = null;
    let trackedJob = null;

    const exitCode = await runCli(["rescue", "Fix the flaky test"], {
      write: (text) => { output += text; },
      createJobMeta: async (command, options) => {
        createdJob = {
          id: "job-foreground",
          command,
          options,
          status: "pending"
        };
        return createdJob;
      },
      runTrackedJob: async (job, execute) => {
        trackedJob = job;
        await execute();
        return { ...job, status: "completed" };
      },
      readHandoff: async () => ({ completed: [], current: [], findings: [] }),
      buildRescuePrompt: ({ taskText }) => taskText,
      runRescueChat: async () => ({
        stdout: "fixed\n",
        stderr: "",
        code: 0
      }),
      writeHandoff: async () => ({}),
    });

    expect(exitCode).toBe(0);
    expect(createdJob?.id).toBe("job-foreground");
    expect(trackedJob?.id).toBe("job-foreground");
    expect(output).toBe("fixed\n");
  });

  it("starts a background rescue job", async () => {
    let output = "";

    const exitCode = await runCli(["rescue", "--background", "Fix the flaky test"], {
      write: (text) => { output += text; },
      createJobMeta: async () => ({
        id: "job-123",
        command: "rescue",
        options: {},
        status: "pending"
      }),
      startDetachedJob: async () => 9999,
      updateJobMeta: async () => ({}),
      renderRescueStartReport: (job) => `Started ${job.id}\n`
    });

    expect(exitCode).toBe(0);
    expect(output).toContain("Started job-123");
  });

  it("renders status output", async () => {
    let output = "";

    await runCli(["status"], {
      write: (text) => { output += text; },
      getStatusReport: async () => ({
        jobs: [{ id: "job-1", command: "review", status: "running", createdAt: "2026-01-01T00:00:00Z" }]
      }),
      renderStatusReport: (report) => `${report.jobs[0].id} ${report.jobs[0].status}\n`
    });

    expect(output).toContain("job-1 running");
  });

  it("renders result output", async () => {
    let output = "";

    await runCli(["result", "job-1"], {
      write: (text) => { output += text; },
      getResultReport: async () => ({
        job: { id: "job-1", status: "completed" },
        logText: "done"
      }),
      renderResultReport: (report) => `${report.job.id} ${report.logText}\n`
    });

    expect(output).toContain("job-1 done");
  });

  it("renders cancel output", async () => {
    let output = "";

    await runCli(["cancel", "job-1"], {
      write: (text) => { output += text; },
      cancelJobAndReport: async () => ({
        job: { id: "job-1", status: "failed", failureReason: "cancelled" }
      }),
      renderCancelReport: (report) => `${report.job.id} ${report.job.failureReason}\n`
    });

    expect(output).toContain("job-1 cancelled");
  });
});
