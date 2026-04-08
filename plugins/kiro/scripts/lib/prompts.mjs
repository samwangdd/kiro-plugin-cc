import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, readText } from "./fs.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function extractJsonBlock(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Could not find JSON object in Kiro review output.");
  }
  return text.slice(firstBrace, lastBrace + 1);
}

export async function loadReviewAssets() {
  const template = await readText(path.join(ROOT_DIR, "prompts", "review.md"));
  const schema = await readJson(path.join(ROOT_DIR, "schemas", "review-output.schema.json"));
  return { template, schema };
}

export function buildReviewPrompt({ template, schema, handoffText, reviewContext }) {
  return template
    .replace("{{REVIEW_SCHEMA}}", JSON.stringify(schema, null, 2))
    .replace("{{TARGET_LABEL}}", reviewContext.target.label)
    .replace("{{HANDOFF_CONTEXT}}", handoffText.trim() || "No handoff available.")
    .replace("{{REVIEW_INPUT}}", reviewContext.content || "No diff available.");
}

export function buildRescuePrompt({ taskText, enrichedTask }) {
  // 如果 Claude Code 侧已构建结构化 prompt，直接使用
  if (enrichedTask) {
    return [
      "你是 Kiro，一个有自主探索能力的 Rescue Agent。",
      "你将收到一个经过分析的结构化任务，请严格按照其中的指示执行。",
      "",
      "执行流程：",
      "1. **理解任务** — 阅读 <task> 中的具体步骤",
      "2. **遵守策略** — 按 <follow_through_policy> 的偏好执行",
      "3. **执行修改** — 完成代码修改",
      "4. **验证完成** — 按 <completeness_contract> 确认所有条件满足",
      "5. **安全检查** — 确保未违反 <action_safety> 中的约束",
      "",
      "---",
      "",
      enrichedTask.trim()
    ].join("\n");
  }

  // fallback：原始静态模板（--raw 模式）
  return [
    "你是 Kiro，一个有自主探索能力的 Rescue Agent。",
    "你将收到一个任务描述，请按以下步骤执行：",
    "",
    "1. **自主探索** — 阅读涉及文件，理解代码逻辑，定位问题根因",
    "2. **自主验证** — 确认理解正确（如读取相关配置、调用 API 验证假设）",
    "3. **执行修改** — 基于自己的理解完成代码修改",
    "4. **构建验证** — 运行构建/测试确保修改正确",
    "",
    "<task>",
    taskText.trim(),
    "</task>",
    "",
    "如果任务描述中缺少以下任何一项，请自主探索补全：",
    "- **现象**：观察到的具体异常行为",
    "- **目标**：期望的结果",
    "- **涉及文件**：相关文件路径及其与问题的关系",
    "- **已知线索**：已发现的关键信息",
    "- **构建方式**：项目构建命令"
  ].join("\n");
}

export function parseReviewOutput(stdout, schema) {
  const parsed = JSON.parse(extractJsonBlock(stdout));
  const required = (schema && schema.required) || [];
  for (const key of required) {
    if (!(key in parsed)) {
      throw new Error(`Missing required field: ${key}`);
    }
  }
  return parsed;
}
