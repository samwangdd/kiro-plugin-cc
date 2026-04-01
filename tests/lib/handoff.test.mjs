import { mkdir, readFile, writeFile } from "node:fs/promises";
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

  it("keeps the hidden state block when the visible snapshot is large", async () => {
    await withTempProject(async (projectRoot) => {
      const completed = Array.from({ length: 120 }, (_, index) => `Completed item ${index + 1}`);
      const current = Array.from({ length: 40 }, (_, index) => `Current item ${index + 1}`);
      const todo = Array.from({ length: 40 }, (_, index) => `Todo item ${index + 1}`);
      const attempts = Array.from({ length: 30 }, (_, index) => ({
        attempt: `Attempt ${index + 1}`,
        result: "成功",
        reason: `Reason ${index + 1}`
      }));
      const findings = Array.from({ length: 40 }, (_, index) => `Finding ${index + 1}`);
      const files = Array.from({ length: 40 }, (_, index) => `src/file-${index + 1}.mjs`);

      await writeHandoff(projectRoot, {
        goal: "Ship Kiro companion with a large state snapshot",
        status: "进行中",
        completed,
        current,
        todo,
        attempts,
        findings,
        context: {
          branch: "feat/kiro-companion",
          files,
          constraints: "Keep V1 hook-free",
          openQuestions: "None"
        }
      });

      const visibleText = await readHandoffText(projectRoot);
      const snapshot = await readHandoff(projectRoot);
      const fullText = await readFile(getHandoffPath(projectRoot), "utf8");

      expect(fullText.split("\n").length).toBeLessThanOrEqual(200);
      expect(fullText).toContain("<!-- kiro-companion-state");
      expect(snapshot.goal).toBe("Ship Kiro companion with a large state snapshot");
      expect(snapshot.completed).toHaveLength(completed.length);
      expect(snapshot.attempts).toHaveLength(attempts.length);
      expect(visibleText).toContain("# Handoff");
      expect(visibleText).toContain("## 目标");
      expect(visibleText).toContain("## 状态：进行中");
      expect(visibleText).toContain("## 进度");
      expect(visibleText).toContain("### 已完成");
      expect(visibleText).toContain("### 当前步骤");
      expect(visibleText).toContain("### 待做");
      expect(visibleText).toContain("## 尝试记录");
      expect(visibleText).toContain("## 关键发现");
      expect(visibleText).toContain("## 上下文快照");
      expect(visibleText).not.toContain("<!-- kiro-companion-state");
    });
  });

  it("round-trips hidden state when content contains comment terminators", async () => {
    await withTempProject(async (projectRoot) => {
      await writeHandoff(projectRoot, {
        goal: "Finish --> safely",
        status: "进行中",
        completed: [],
        current: ["Handle --> safely"],
        todo: [],
        attempts: [],
        findings: ["Need to preserve --> inside state"],
        context: {
          branch: "feat/kiro-companion",
          files: ["plugins/kiro/scripts/lib/handoff.mjs"],
          constraints: "Keep hidden state intact -->",
          openQuestions: "None"
        }
      });

      const snapshot = await readHandoff(projectRoot);
      const fullText = await readFile(getHandoffPath(projectRoot), "utf8");

      expect(snapshot.goal).toBe("Finish --> safely");
      expect(snapshot.current[0]).toBe("Handle --> safely");
      expect(snapshot.findings[0]).toBe("Need to preserve --> inside state");
      expect(snapshot.context.constraints).toBe("Keep hidden state intact -->");
      expect(fullText).toContain("<!-- kiro-companion-state");
    });
  });

  it("keeps the file within budget when visible text contains newlines", async () => {
    await withTempProject(async (projectRoot) => {
      await writeHandoff(projectRoot, {
        goal: "Line one\nLine two\nLine three",
        status: "进行中",
        completed: ["Item one\nItem two"],
        current: ["Current one\nCurrent two"],
        todo: ["Todo one\nTodo two"],
        attempts: [
          {
            attempt: "Attempt one\nAttempt two",
            result: "成功",
            reason: "Reason one\nReason two"
          }
        ],
        findings: ["Finding one\nFinding two"],
        context: {
          branch: "feat/kiro-companion",
          files: ["src/one\nsrc/two"],
          constraints: "Constraint one\nConstraint two",
          openQuestions: "Question one\nQuestion two"
        }
      });

      const fullText = await readFile(getHandoffPath(projectRoot), "utf8");

      expect(fullText.split("\n").length).toBeLessThanOrEqual(200);
      expect(fullText).toContain("Line one Line two Line three");
      expect(fullText).not.toContain("Line one\nLine two\nLine three");
    });
  });

  it("fills missing nested context defaults when reading hidden state", async () => {
    await withTempProject(async (projectRoot) => {
      await mkdir(`${projectRoot}/.kiro-companion`, { recursive: true });
      const stateBlock = JSON.stringify({
        goal: "Ship Kiro companion",
        context: {
          branch: "feat/kiro-companion"
        }
      });

      await writeFile(
        getHandoffPath(projectRoot),
        `# Handoff — kiro-companion-project\n\n<!-- kiro-companion-state ${stateBlock} -->\n`,
        "utf8"
      );

      const snapshot = await readHandoff(projectRoot);

      expect(snapshot.goal).toBe("Ship Kiro companion");
      expect(snapshot.context.branch).toBe("feat/kiro-companion");
      expect(snapshot.context.files).toEqual([]);
      expect(snapshot.context.constraints).toBe("");
      expect(snapshot.context.openQuestions).toBe("");
    });
  });

  it("escapes pipe characters in attempts table cells", async () => {
    await withTempProject(async (projectRoot) => {
      await writeHandoff(projectRoot, {
        goal: "Ship Kiro companion",
        status: "进行中",
        attempts: [
          {
            attempt: "Check | render",
            result: "成功 | maybe",
            reason: "Reason | one"
          }
        ]
      });

      const visibleText = await readHandoffText(projectRoot);

      expect(visibleText).toContain("Check \\| render");
      expect(visibleText).toContain("成功 \\| maybe");
      expect(visibleText).toContain("Reason \\| one");
    });
  });
});
