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

function normalizeVisibleText(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeVisibleList(items) {
  return items.map((item) => normalizeVisibleText(item));
}

function escapeMarkdownTableCell(value) {
  return normalizeVisibleText(value).replace(/\|/gu, "\\|");
}

function mergeContext(context = {}, defaults) {
  return {
    ...defaults,
    ...(context || {})
  };
}

function buildSnapshot(projectRoot, input = {}) {
  const base = defaultSnapshot(projectRoot);
  const inputContext = input.context || {};

  return {
    ...base,
    ...input,
    goal: normalizeVisibleText(input.goal ?? base.goal),
    status: normalizeVisibleText(input.status ?? base.status),
    completed: normalizeVisibleList(input.completed ?? base.completed),
    current: normalizeVisibleList(input.current ?? base.current),
    todo: normalizeVisibleList(input.todo ?? base.todo),
    attempts: (input.attempts ?? base.attempts).map((item) => ({
      attempt: normalizeVisibleText(item.attempt),
      result: normalizeVisibleText(item.result),
      reason: normalizeVisibleText(item.reason)
    })),
    findings: normalizeVisibleList(input.findings ?? base.findings),
    context: {
      ...base.context,
      ...inputContext,
      branch: normalizeVisibleText(inputContext.branch ?? base.context.branch),
      files: normalizeVisibleList(inputContext.files ?? base.context.files),
      constraints: normalizeVisibleText(
        inputContext.constraints ?? base.context.constraints
      ),
      openQuestions: normalizeVisibleText(
        inputContext.openQuestions ?? base.context.openQuestions
      )
    },
    updatedAt: new Date().toISOString()
  };
}

function encodeHiddenState(snapshot) {
  return Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64url");
}

function decodeHiddenState(encoded) {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return JSON.parse(encoded);
  }
}

function parseHiddenState(text, projectRoot) {
  const match = text.match(/<!-- kiro-companion-state\s*([\s\S]*?)-->/);

  if (!match) {
    return defaultSnapshot(projectRoot);
  }

  try {
    const parsed = decodeHiddenState(match[1]);
    return {
      ...defaultSnapshot(projectRoot),
      ...parsed,
      context: mergeContext(parsed.context, defaultSnapshot(projectRoot).context)
    };
  } catch {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        ...defaultSnapshot(projectRoot),
        ...parsed,
        context: mergeContext(parsed.context, defaultSnapshot(projectRoot).context)
      };
    } catch {
      return defaultSnapshot(projectRoot);
    }
  }
}

function linesForChecklist(items, checked) {
  return items.length === 0
    ? ["- [ ] 暂无"]
    : items.map((item) => `- [${checked ? "x" : " "}] ${normalizeVisibleText(item)}`);
}

function linesForAttempts(items) {
  if (items.length === 0) {
    return ["| 暂无 | 暂无 | 暂无 |"];
  }

  return items.map((item) => {
    const attempt = escapeMarkdownTableCell(item.attempt);
    const result = escapeMarkdownTableCell(item.result);
    const reason = escapeMarkdownTableCell(item.reason);
    return `| ${attempt} | ${result} | ${reason} |`;
  });
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
    (item) => `- [x] ${normalizeVisibleText(item)}`,
    "- [ ] 暂无",
    (overflow) => `- … 还有 ${overflow} 项已完成`
  );
  const currentLines = linesWithOverflow(
    snapshot.current,
    VISIBLE_LIMITS.current,
    (item) => `- [ ] ${normalizeVisibleText(item)}`,
    "- [ ] 暂无",
    (overflow) => `- … 还有 ${overflow} 项当前步骤`
  );
  const todoLines = linesWithOverflow(
    snapshot.todo,
    VISIBLE_LIMITS.todo,
    (item) => `- [ ] ${normalizeVisibleText(item)}`,
    "- [ ] 暂无",
    (overflow) => `- … 还有 ${overflow} 项待做`
  );
  const attemptRows = linesWithOverflow(
    snapshot.attempts,
    VISIBLE_LIMITS.attempts,
    (item) =>
      `| ${escapeMarkdownTableCell(item.attempt)} | ${escapeMarkdownTableCell(
        item.result
      )} | ${escapeMarkdownTableCell(item.reason)} |`,
    "| 暂无 | 暂无 | 暂无 |",
    (overflow) => `| … 还有 ${overflow} 项 | … | … |`
  );
  const findingLines = linesWithOverflow(
    snapshot.findings,
    VISIBLE_LIMITS.findings,
    (item) => `- ${normalizeVisibleText(item)}`,
    "- 暂无",
    (overflow) => `- … 还有 ${overflow} 项关键发现`
  );
  const fileLines = linesWithOverflow(
    snapshot.context.files,
    VISIBLE_LIMITS.files,
    (item) => `\`${normalizeVisibleText(item)}\``,
    "暂无",
    (overflow) => `… 还有 ${overflow} 个文件`
  );

  return [
    `# Handoff — ${snapshot.projectName}`,
    "",
    "## 目标",
    normalizeVisibleText(snapshot.goal),
    "",
    `## 状态：${normalizeVisibleText(snapshot.status)}`,
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
    `- **当前分支**：\`${normalizeVisibleText(snapshot.context.branch)}\``,
    `- **涉及文件**：${fileLines.length === 1 && fileLines[0] === "暂无" ? "暂无" : fileLines.join(", ")}`,
    `- **依赖约束**：${normalizeVisibleText(snapshot.context.constraints) || "暂无"}`,
    `- **开放问题**：${normalizeVisibleText(snapshot.context.openQuestions) || "暂无"}`,
    "",
    "---",
    `最后更新：${normalizeVisibleText(snapshot.updatedAt)}`
  ];
}

export function getHandoffPath(projectRoot) {
  return path.join(projectRoot, ".kiro-companion", "handoff.md");
}

export function renderHandoff(projectRoot, input = {}) {
  const snapshot = buildSnapshot(projectRoot, input);

  const hiddenLines = [
    `${STATE_PREFIX}`,
    encodeHiddenState(snapshot),
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
