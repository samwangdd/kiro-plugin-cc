import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { withTempProject } from "../helpers/temp-env.mjs";
import {
  ensureHandoff,
  getHandoffPath,
  readHandoff,
  readHandoffText,
  writeHandoff
} from "../../plugins/kiro/scripts/lib/handoff.mjs";

describe("handoff document", () => {
  it("renders the required markdown structure and round-trips state", async () => {
    await withTempProject(async (projectRoot) => {
      await ensureHandoff(projectRoot, {
        goal: "Ship Kiro companion",
        status: "进行中",
        current: ["Implement setup command"],
        todo: ["Implement review command"]
      });

      await writeHandoff(projectRoot, {
        goal: "Ship Kiro companion",
        status: "进行中",
        completed: ["Bootstrap workspace — done"],
        current: ["Implement setup command"],
        todo: ["Implement review command"],
        attempts: [
          {
            attempt: "Use hidden JSON state block",
            result: "成功",
            reason: "Allows reliable incremental writes"
          }
        ],
        findings: ["Kiro setup requires whoami + list-models checks"],
        context: {
          branch: "feat/kiro-companion",
          files: ["plugins/kiro/scripts/kiro-companion.mjs"],
          constraints: "Keep V1 hook-free",
          openQuestions: "None"
        }
      });

      const visibleText = await readHandoffText(projectRoot);
      const snapshot = await readHandoff(projectRoot);
      const fullText = await readFile(getHandoffPath(projectRoot), "utf8");

      expect(visibleText).toContain("# Handoff");
      expect(visibleText).toContain("## 目标");
      expect(visibleText).toContain("## 状态：进行中");
      expect(visibleText).toContain("## 关键发现");
      expect(snapshot.goal).toBe("Ship Kiro companion");
      expect(snapshot.context.branch).toBe("feat/kiro-companion");
      expect(fullText).toContain("<!-- kiro-companion-state");
      expect(fullText.split("\n").length).toBeLessThanOrEqual(200);
    });
  });
});
