import path from "node:path";

import { readText, writeText } from "./fs.mjs";

const STATE_PREFIX = "<!-- kiro-companion-state";
const STATE_SUFFIX = "-->";
const MAX_TOTAL_LINES = 200;
const VISIBLE_LIMITS = {
  completed: 20,
  current: 10,
  todo: 10,
  attempts: 5,
  findings: 10,
  files: 10
};

function defaultSnapshot(projectRoot) {
  return {
    projectName: path.basename(projectRoot),
    goal: "待定义",
    status: "进行中",
    completed: [],
    current: [],
    todo: [],
    attempts: [],
    findings: [],
    context: {
      branch: "unknown",
      files: [],
      constraints: "",
      openQuestions: ""
    },
    updatedAt: new Date().toISOString()
  };
}

function parseHiddenState(text, projectRoot) {
  const match = text.match(/<!-- kiro-companion-state\s*([\s\S]*?)-->/);

  if (!match) {
    return defaultSnapshot(projectRoot);
  }

  try {
    return {
      ...defaultSnapshot(projectRoot),
      ...JSON.parse(match[1])
    };
  } catch {
    return defaultSnapshot(projectRoot);
  }
}

function linesForChecklist(items, checked) {
  return items.length === 0
    ? ["- [ ] 暂无"]
    : items.map((item) => `- [${checked ? "x" : " "}] ${item}`);
}

function linesForAttempts(items) {
  if (items.length === 0) {
    return ["| 暂无 | 暂无 | 暂无 |"];
  }

  return items.map((item) => `| ${item.attempt} | ${item.result} | ${item.reason} |`);
}

function linesWithOverflow(items, limit, renderItem, emptyLine, overflowLabel) {
  if (items.length === 0) {
    return [emptyLine];
  }

  const visibleItems = items.slice(0, limit).map(renderItem);
  if (items.length <= limit) {
    return visibleItems;
  }

  return [
    ...visibleItems,
    overflowLabel(items.length - limit)
  ];
}

function buildVisibleLines(snapshot) {
  const completedLines = linesWithOverflow(
    snapshot.completed,
    VISIBLE_LIMITS.completed,
    (item) => `- [x] ${item}`,
    "- [ ] 暂无",
    (overflow) => `- … 还有 ${overflow} 项已完成`
  );
  const currentLines = linesWithOverflow(
    snapshot.current,
    VISIBLE_LIMITS.current,
    (item) => `- [ ] ${item}`,
    "- [ ] 暂无",
    (overflow) => `- … 还有 ${overflow} 项当前步骤`
  );
  const todoLines = linesWithOverflow(
    snapshot.todo,
    VISIBLE_LIMITS.todo,
    (item) => `- [ ] ${item}`,
    "- [ ] 暂无",
    (overflow) => `- … 还有 ${overflow} 项待做`
  );
  const attemptRows = linesWithOverflow(
    snapshot.attempts,
    VISIBLE_LIMITS.attempts,
    (item) => `| ${item.attempt} | ${item.result} | ${item.reason} |`,
    "| 暂无 | 暂无 | 暂无 |",
    (overflow) => `| … 还有 ${overflow} 项 | … | … |`
  );
  const findingLines = linesWithOverflow(
    snapshot.findings,
    VISIBLE_LIMITS.findings,
    (item) => `- ${item}`,
    "- 暂无",
    (overflow) => `- … 还有 ${overflow} 项关键发现`
  );
  const fileLines = linesWithOverflow(
    snapshot.context.files,
    VISIBLE_LIMITS.files,
    (item) => `\`${item}\``,
    "暂无",
    (overflow) => `… 还有 ${overflow} 个文件`
  );

  return [
    `# Handoff — ${snapshot.projectName}`,
    "",
    "## 目标",
    snapshot.goal,
    "",
    `## 状态：${snapshot.status}`,
    "",
    "## 进度",
    "",
    "### 已完成",
    ...completedLines,
    "",
    "### 当前步骤",
    ...currentLines,
    "",
    "### 待做",
    ...todoLines,
    "",
    "## 尝试记录",
    "| 尝试 | 结果 | 原因 |",
    "|------|------|------|",
    ...attemptRows,
    "",
    "## 关键发现",
    ...findingLines,
    "",
    "## 上下文快照",
    `- **当前分支**：\`${snapshot.context.branch}\``,
    `- **涉及文件**：${fileLines.length === 1 && fileLines[0] === "暂无" ? "暂无" : fileLines.join(", ")}`,
    `- **依赖约束**：${snapshot.context.constraints || "暂无"}`,
    `- **开放问题**：${snapshot.context.openQuestions || "暂无"}`,
    "",
    "---",
    `最后更新：${snapshot.updatedAt}`
  ];
}

export function getHandoffPath(projectRoot) {
  return path.join(projectRoot, ".kiro-companion", "handoff.md");
}

export function renderHandoff(projectRoot, input = {}) {
  const base = defaultSnapshot(projectRoot);
  const snapshot = {
    ...base,
    ...input,
    context: {
      ...base.context,
      ...(input.context || {})
    },
    updatedAt: new Date().toISOString()
  };

  const hiddenLines = [
    `${STATE_PREFIX}`,
    JSON.stringify(snapshot),
    STATE_SUFFIX
  ];
  const maxVisibleLines = Math.max(0, MAX_TOTAL_LINES - hiddenLines.length - 2);
  const visibleLines = buildVisibleLines(snapshot).slice(0, maxVisibleLines);

  return [...visibleLines, "", ...hiddenLines, ""].join("\n");
}

export async function ensureHandoff(projectRoot, seed = {}) {
  const current = await readText(getHandoffPath(projectRoot), "");
  if (current) {
    return current;
  }

  const rendered = renderHandoff(projectRoot, seed);
  await writeText(getHandoffPath(projectRoot), rendered);
  return rendered;
}

export async function readHandoff(projectRoot) {
  const text = await readText(getHandoffPath(projectRoot), "");
  return parseHiddenState(text, projectRoot);
}

export async function readHandoffText(projectRoot) {
  const text = await readText(getHandoffPath(projectRoot), "");
  return text.replace(/<!-- kiro-companion-state[\s\S]*?-->\s*$/u, "").trimEnd() + "\n";
}

export async function writeHandoff(projectRoot, snapshot) {
  const rendered = renderHandoff(projectRoot, snapshot);
  await writeText(getHandoffPath(projectRoot), rendered);
  return rendered;
}
