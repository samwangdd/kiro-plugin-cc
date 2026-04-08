# Rescue Prompt Enrichment

> 借鉴 codex-plugin-cc 的 prompt 构建模式，让 Claude Code 在委托 Kiro 之前做意图分析和上下文注入。

## 背景

之前 `/kiro:rescue` 设置了 `disable-model-invocation: true`，Claude Code 只做透传——用户输入原样塞进固定模板丢给 kiro-cli。Kiro 需要从零开始探索项目上下文。

对比 codex-plugin-cc 的做法：Claude Code 先理解用户意图，收集 git 上下文，构建包含具体步骤、执行策略、完成标准和安全约束的结构化 prompt，再委托给 Codex CLI。

## 改动

### 1. `plugins/kiro/commands/rescue.md`

- 移除 `disable-model-invocation: true`，启用 Claude Code 侧思考
- 新增 `Bash(git:*)` 权限，允许收集 git 上下文
- Claude Code 执行流程：
  1. 并行收集 `git branch` + `git log`
  2. 构建结构化 prompt（`<task>` / `<follow_through_policy>` / `<completeness_contract>` / `<action_safety>`）
  3. 通过 `--enriched-task` 传给 companion
- `--raw` 标志跳过 enrichment，走原来的直通模式

### 2. `plugins/kiro/scripts/lib/prompts.mjs`

- `buildRescuePrompt` 新增 `enrichedTask` 参数
- 有 `enrichedTask` 时：使用 Claude 构建的结构化 prompt，指引 Kiro 按块执行
- 无 `enrichedTask` 时：fallback 到原始静态模板

### 3. `plugins/kiro/scripts/kiro-companion.mjs`

- 解析 `--enriched-task` option 和 `--raw` flag
- `enrichedTask` 透传到 `executeRescueJob` → `buildRescuePrompt`
- 验证逻辑：`task` 或 `enrichedTask` 有一个即可

### 4. 测试更新

- `tests/plugin/plugin-files.test.mjs` 断言匹配新的 rescue.md 结构

## 执行流程对比

```
之前: 用户输入 → 原样塞模板 → kiro-cli
现在: 用户输入 → Claude 分析意图 + 收集 git 上下文 → 构建结构化 prompt → kiro-cli
```
