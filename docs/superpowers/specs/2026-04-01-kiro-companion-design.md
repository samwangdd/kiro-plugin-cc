# Kiro Companion for Claude Code — 设计文档

> 日期：2026-04-01
> 状态：已批准

> 2026-04-04 更新：`/kiro:rescue` 已调整为命令层直接执行 `kiro-companion`，不再经过 Claude rescue subagent。

## 概述

kiro-companion 是一个 Claude Code 插件，让 Claude Code 可以通过 `kiro-cli` 调用 Kiro 的 AI 能力，实现代码审查（review）和任务派发（rescue）。设计参考 codex-plugin-cc，但针对 kiro-cli 的能力做了精简适配。

## 项目结构

```
kiro-plugin-cc/
├── .claude-plugin/
│   └── marketplace.json          # 插件市场配置
├── plugins/
│   └── kiro/
│       ├── .claude-plugin/
│       │   └── plugin.json       # 插件配置
│       ├── commands/
│       │   ├── review.md         # /kiro:review 命令
│       │   ├── rescue.md         # /kiro:rescue 命令
│       │   ├── status.md         # /kiro:status 命令
│       │   ├── result.md         # /kiro:result 命令
│       │   ├── cancel.md         # /kiro:cancel 命令
│       │   └── setup.md          # /kiro:setup 命令
│       ├── prompts/
│       │   └── review.md         # 审查 prompt 模板
│       ├── schemas/
│       │   └── review-output.schema.json  # 审查输出 JSON Schema
│       └── scripts/
│           ├── kiro-companion.mjs # 主 companion 脚本
│           └── lib/
│               ├── kiro.mjs      # kiro-cli 集成核心
│               ├── state.mjs     # 状态管理
│               ├── job-control.mjs # 作业控制
│               ├── git.mjs       # Git 集成
│               ├── fs.mjs        # 文件系统工具
│               ├── prompts.mjs   # prompt 模板
│               ├── render.mjs    # 输出渲染
│               └── handoff.mjs   # Handoff 文档管理
├── package.json
└── README.md
```

### 与 codex-plugin-cc 的差异

- 去掉 App Server / JSON-RPC / Broker 组件（kiro-cli 不支持 server 模式）
- 去掉 hooks（Stop review gate 等，V1 先不做）
- 新增 `handoff.mjs` 用于 Handoff 文档管理
- 核心交互通过 `kiro-cli chat --no-interactive --trust-all-tools` 实现

## 核心交互机制

### kiro-cli 调用封装

`lib/kiro.mjs` 封装所有与 `kiro-cli` 的交互：

```
# 基本调用
kiro-cli chat --no-interactive --trust-all-tools --model <model> "prompt"

# resume 模式
kiro-cli chat --resume --no-interactive --trust-all-tools "prompt"

# 指定 agent profile
kiro-cli chat --agent kiro_planner --no-interactive "prompt"
```

### 作业生命周期

```
创建 Job → 生成 prompt → 调用 kiro-cli chat → 捕获 stdout → 解析结果 → 更新 Job 状态
```

- **Job 状态**：`pending` → `running` → `completed` / `failed`
- **后台执行**：通过 `run_in_background` 让 Bash 命令在后台运行
- **结果存储**：stdout 输出写入 `~/.kiro-companion/jobs/<job-id>.log`
- **会话恢复**：利用 `kiro-cli chat --resume` 支持继续上次的会话

### 状态存储

```
~/.kiro-companion/
├── state.json          # 全局状态（配置、job 列表摘要）
└── jobs/
    ├── <job-id>.log    # 完整输出日志
    └── <job-id>.meta   # 元数据（命令、参数、状态、时间）
```

### 错误处理

| 场景 | 处理方式 |
|------|----------|
| kiro-cli 未安装 | `/kiro:setup` 检测并提示安装 |
| 执行超时 | 默认 5 分钟超时，可通过配置调整 |
| 输出解析失败 | 保留原始输出，标记为 `needs_review` |
| 非零退出码 | 捕获 stderr，标记 Job 为 `failed` |

## Handoff 文档

### 文件位置

```
.kiro-companion/handoff.md    # 项目根目录下
```

### 文档结构

```markdown
# Handoff — <项目名>

## 目标
<!-- 当前任务的最终目标，一句话描述 -->

## 状态：进行中 | 阻塞 | 已完成

## 进度

### 已完成
- [x] <完成的步骤 1> — <简短结果>
- [x] <完成的步骤 2> — <简短结果>

### 当前步骤
- [ ] <正在做的事> — <状态描述>

### 待做
- [ ] <下一步>
- [ ] <后续步骤>

## 尝试记录
| 尝试 | 结果 | 原因 |
|------|------|------|
| <方案描述> | 成功/失败 | <原因分析> |

## 关键发现
- <发现 1：影响后续决策的事实>
- <发现 2：需要避免的坑>

## 上下文快照
<!-- 压缩对话时自动更新的关键信息 -->
- **当前分支**：`feat/xxx`
- **涉及文件**：`path/to/file1.ts`, `path/to/file2.ts`
- **依赖约束**：<必须满足的条件>
- **开放问题**：<未解决的疑问>

---
最后更新：<ISO 时间戳>
```

### 更新机制

- **主 Agent** 在每个关键节点更新 Handoff
- **派发任务前**：将 Handoff 当前状态附加到 prompt 中传给 kiro-cli
- **收到结果后**：根据子 agent 返回的结果更新 Handoff
- **上下文压缩前**：确保 Handoff 已包含所有关键信息

### 设计原则

1. **人工可读**：纯 Markdown，用户可直接查看和编辑
2. **增量更新**：每次只更新变化的部分
3. **精简控制**：整个文档控制在 200 行以内
4. **git 友好**：加入 `.gitignore`，不提交到仓库

## 命令定义

### /kiro:review — 代码审查

**行为**：
1. 收集当前 git 变更（`git diff` + 未跟踪文件）
2. 将 diff 包装到审查 prompt 中，附加 Handoff 上下文
3. 调用 `kiro-cli chat --no-interactive "review prompt"`
4. 解析输出，按 `review-output.schema.json` 验证格式
5. 展示结构化审查结果

**参数**：
- `--base <ref>`：指定对比的 base 分支/commit
- `--background`：后台执行
- `--wait`：前台等待（默认）

### /kiro:rescue — 任务派发

**行为**：
1. Slash command 直接执行 `node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue ...`
2. `kiro-companion` 将用户任务 + Handoff 上下文 组合成完整 prompt
3. `kiro-companion` 调用 `kiro-cli chat --no-interactive --trust-all-tools "task prompt"`
4. Kiro 执行完毕后返回 stdout，由 `kiro-companion` 更新 Handoff 并将结果原样返回

**参数**：
- `--background`：后台执行
- `--wait`：前台等待（默认）
- `--resume`：继续上次 Kiro 会话
- `--fresh`：强制新会话（默认）
- `--model <model>`：指定模型
- `--agent <agent>`：指定 Kiro agent profile

### /kiro:setup — 环境检查

检测 `kiro-cli` 是否安装、是否已登录、可用模型列表。

### /kiro:status — 作业状态

列出当前所有 Job 的状态和进度摘要。

### /kiro:result <job-id> — 查看结果

获取指定 Job 的完整输出。

### /kiro:cancel <job-id> — 取消作业

终止正在运行的 kiro-cli 进程。

## 命令执行模型

- `/kiro:review`：slash command 直接执行 `kiro-companion review`
- `/kiro:rescue`：slash command 直接执行 `kiro-companion rescue`
- `/kiro:setup` / `/kiro:status` / `/kiro:result` / `/kiro:cancel`：同样走命令层直连
- rescue 不再依赖 Claude Code subagent 或内部 forwarding skill

## 完整工作流

### 审查 + 派发

1. 主 Agent 更新 Handoff：记录目标、创建步骤列表
2. 执行 `/kiro:review --base main`，获取审查反馈
3. 根据审查结果决定是否派发
4. 执行 `/kiro:rescue "任务描述"`，将 Handoff 上下文附加到 prompt
5. 更新 Handoff：记录完成情况、发现、下一步

### 上下文压缩恢复

1. 上下文被压缩后，主 Agent 读取 `.kiro-companion/handoff.md`
2. 从中恢复：目标、当前步骤、尝试记录、关键发现
3. 继续执行未完成的步骤

### 后台任务

1. 创建后台 Job
2. 异步执行 `kiro-cli chat`
3. 通过 `/kiro:status` 查看进度
4. 完成后通过 `/kiro:result <id>` 获取结果
5. 更新 Handoff

## V1 范围

### 做

- review / rescue / status / result / cancel / setup 六个命令
- Handoff 文档管理
- 作业状态持久化
- 后台执行支持

### 不做（V1 之后）

- Stop hook review gate
- SessionStart/SessionEnd hooks
- Adversarial review
- 实时进度 streaming
- ACP 协议集成
